import { useCallback, useEffect, useRef, useState } from 'react'
import type { MediaJob } from './useMediaSession'
import { targetLanguages } from '../lib/languages'
import { audioTimeAt, switchBoundary, videoCorrection, videoRateAt, videoTimeAt } from '../lib/playback'

const name = (language: string) => targetLanguages.find((item) => item.code === language)?.name ?? 'Original'
type Voice = { source: AudioBufferSourceNode; gain: GainNode; started: number; offset: number }

export function useDubPlayer(job: MediaJob | null, language: string) {
  const video = useRef<HTMLVideoElement | null>(null)
  const context = useRef<AudioContext | null>(null)
  const voice = useRef<Voice | null>(null)
  const buffers = useRef(new Map<string, AudioBuffer>())
  const loading = useRef(new Set<string>())
  const downloadErrors = useRef(new Map<string, string>())
  const controllers = useRef(new Set<AbortController>())
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [state, setState] = useState('Paused')
  const [error, setError] = useState('')
  const [translationError, setTranslationError] = useState('')
  const [audioStarts, setAudioStarts] = useState(0)
  const [drift, setDrift] = useState(0)
  const [activeLanguage, setActiveLanguage] = useState('original')
  const [activity, setActivity] = useState<string[]>([])
  const active = useRef('original')
  const desired = useRef(false)
  const latest = useRef({ job, language })
  const starting = useRef(false)
  const epoch = useRef(0)
  const selection = useRef(0)
  const requestMessage = useRef<string | null>(null)
  const pendingSwitch = useRef<{ language: string; at: number } | null>(null)
  useEffect(() => { latest.current = { job, language } }, [job, language])

  const stopVoice = useCallback(() => {
    const current = voice.current
    if (!current || !context.current) return
    const now = context.current.currentTime
    current.gain.gain.cancelScheduledValues(now)
    current.gain.gain.setValueAtTime(current.gain.gain.value, now)
    current.gain.gain.linearRampToValueAtTime(0, now + 0.015)
    current.source.stop(now + 0.02)
    voice.current = null
  }, [])
  const pause = useCallback(() => {
    desired.current = false; epoch.current++; video.current?.pause(); stopVoice(); setPlaying(false); setState('Paused')
  }, [stopVoice])
  const reset = useCallback(() => {
    pause(); buffers.current.clear(); loading.current.clear(); downloadErrors.current.clear(); pendingSwitch.current = null
    for (const controller of controllers.current) controller.abort()
    controllers.current.clear(); active.current = 'original'; setActiveLanguage('original'); setActivity([]); setTime(0); setError(''); setTranslationError(''); setAudioStarts(0); setDrift(0)
    if (video.current) { video.current.currentTime = 0; video.current.muted = false; video.current.playbackRate = 1 }
  }, [pause])
  const seek = useCallback((next: number) => {
    epoch.current++; video.current?.pause(); stopVoice(); pendingSwitch.current = null
    if (video.current) video.current.currentTime = next
    setTime(next)
  }, [stopVoice])
  const play = useCallback(() => {
    context.current ??= new AudioContext()
    void context.current.resume().catch(() => setError('Audio could not start. Press play again.'))
    if (video.current?.ended) video.current.currentTime = 0
    setError(''); desired.current = true; setPlaying(true)
  }, [])
  const toggle = useCallback(() => { if (desired.current) pause(); else play() }, [pause, play])
  const buffering = useCallback(() => { epoch.current++; stopVoice() }, [stopVoice])

  const requestTrack = useCallback(async (id: string, target: string, retry = false) => {
    const version = ++selection.current
    try {
      const response = await fetch(`/api/media/${id}/tracks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: target, retry, selection: version }) })
      if (!response.ok) { const body = await response.json(); throw new Error(body.error ?? 'Could not prepare this language.') }
      if (version === selection.current) requestMessage.current = ''
    } catch (caught) { if (version === selection.current) requestMessage.current = caught instanceof Error ? caught.message : 'Connection failed.' }
  }, [])
  const jobId = job?.id
  useEffect(() => { if (jobId) void requestTrack(jobId, language) }, [jobId, language, requestTrack])
  const retry = useCallback(() => {
    const current = latest.current
    if (current.job) {
      downloadErrors.current.delete(`${current.job.id}/${current.language}`)
      void requestTrack(current.job.id, current.language, true)
    }
  }, [requestTrack])

  useEffect(() => {
    const localControllers = controllers.current
    const tick = async () => {
      const media = video.current
      if (!media) return
      if (requestMessage.current !== null) { setError(requestMessage.current); requestMessage.current = null }
      const { job: current, language: target } = latest.current
      const position = media.currentTime; setTime(position)
      const targetTrack = current?.tracks[target]
      const key = `${current?.id}/${target}`
      if (targetTrack?.state === 'ready' && targetTrack.audioUrl && !buffers.current.has(key) && !loading.current.has(key) && !downloadErrors.current.has(key)) {
        context.current ??= new AudioContext()
        loading.current.add(key)
        const controller = new AbortController(); localControllers.add(controller)
        void fetch(targetTrack.audioUrl, { signal: controller.signal }).then(async (response) => {
          if (!response.ok) throw new Error('Prepared audio could not be downloaded. Retry this language.')
          const buffer = await context.current!.decodeAudioData(await response.arrayBuffer())
          if (controller.signal.aborted || latest.current.job?.id !== current?.id) return
          buffers.current.set(key, buffer)
          for (const cached of buffers.current.keys()) {
            if (buffers.current.size <= 3) break
            if (cached !== key && cached !== `${current?.id}/${active.current}`) buffers.current.delete(cached)
          }
        }).catch((caught: Error) => { if (!controller.signal.aborted) downloadErrors.current.set(key, caught.message) })
          .finally(() => { loading.current.delete(key); localControllers.delete(controller) })
      }
      const ready = target === 'original' || buffers.current.has(key)
      if (target !== active.current && ready) {
        if (pendingSwitch.current?.language !== target) pendingSwitch.current = { language: target, at: !desired.current || target === 'original' ? position : switchBoundary(targetTrack?.segments.map((segment) => segment.start) ?? [], position) }
        if (!desired.current || position >= pendingSwitch.current.at) {
          epoch.current++; stopVoice(); active.current = target; setActiveLanguage(target); media.playbackRate = 1; pendingSwitch.current = null
          setActivity((items) => [`${name(target)} active at ${Math.floor(position)}s`, ...items].slice(0, 5))
        }
      } else if (target === active.current || pendingSwitch.current?.language !== target) pendingSwitch.current = null
      const activeKey = `${current?.id}/${active.current}`
      const activeBuffer = buffers.current.get(activeKey)
      media.muted = active.current !== 'original'
      const targetError = targetTrack?.error ?? downloadErrors.current.get(key)
      setTranslationError(targetError ?? '')
      const preparation = target !== active.current ? targetError ? `${name(target)} preparation failed · current audio unchanged` : ready ? `Switching to ${name(target)} at the next section` : `Preparing ${name(target)} · ${targetTrack?.completed ?? 0}/${targetTrack?.total || '…'} sections` : ''
      if (!desired.current || starting.current) { if (!desired.current) setState(preparation || (media.ended ? 'Finished · press play to restart' : 'Paused')); return }
      if (media.ended) {
        // Video can arrive a few milliseconds before the audio clock. Let the
        // final spoken sound finish instead of cutting it at the visual endpoint.
        if (active.current !== 'original' && activeBuffer && voice.current && context.current && voice.current.offset + context.current.currentTime - voice.current.started < activeBuffer.duration) { setState('Finishing translated audio…'); return }
        pause(); setState('Finished · press play to restart'); return
      }
      if (media.readyState < 3 || media.seeking) { stopVoice(); setState('Buffering video…'); return }
      if (active.current !== 'original' && !activeBuffer) { pause(); setError('The prepared track is unavailable. Select Original or retry.'); return }
      if (media.paused) {
        starting.current = true; const version = epoch.current
        try { await media.play(); if (version !== epoch.current || !desired.current) { media.pause(); return } }
        catch { pause(); setError('Press play again to start the video.'); return }
        finally { starting.current = false }
      }
      if (activeBuffer && active.current !== 'original' && context.current) {
        if (context.current.state !== 'running') { pause(); setError('Press play to enable translated audio.'); return }
        const sections = current?.tracks[active.current]?.segments ?? []
        const offset = audioTimeAt(sections, media.currentTime)
        if (!voice.current && offset < activeBuffer.duration) {
          const source = context.current.createBufferSource(); const gain = context.current.createGain()
          source.buffer = activeBuffer; source.connect(gain); gain.connect(context.current.destination)
          const now = context.current.currentTime
          gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(1, now + 0.015)
          source.start(now, offset)
          voice.current = { source, gain, started: now, offset }
          setAudioStarts((count) => count + 1)
          source.onended = () => { source.disconnect(); gain.disconnect() }
        }
        if (voice.current) {
          const audioPosition = voice.current.offset + context.current.currentTime - voice.current.started
          const expectedVideoTime = videoTimeAt(sections, audioPosition)
          setDrift(Math.round((expectedVideoTime - media.currentTime) * 1000))
          media.playbackRate = videoRateAt(sections, audioPosition) * videoCorrection(expectedVideoTime, media.currentTime)
        }
      } else { media.playbackRate = 1; setDrift(0) }
      setState(preparation ? `Playing ${name(active.current)} · ${preparation}` : `Playing ${name(active.current)}`)
    }
    const interval = setInterval(() => { void tick() }, 50)
    return () => { clearInterval(interval); for (const controller of localControllers) controller.abort(); stopVoice() }
  }, [pause, stopVoice])

  return { videoRef: video, playing, time, state, error, translationError, audioStarts, drift, activeLanguage, activity, play, toggle, pause, reset, seek, buffering, retry }
}
