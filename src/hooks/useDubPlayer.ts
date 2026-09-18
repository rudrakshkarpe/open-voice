import { useCallback, useEffect, useRef, useState } from 'react'
import type { MediaJob } from './useMediaSession'
import { targetLanguages } from '../lib/languages'
import { videoCorrection } from '../lib/playback'
import { AudioQueue, bufferedAhead, canStartStream, chunkAt } from '../lib/audioQueue'
import type { AudioChunk } from '../lib/audioQueue'
import type { PlaybackPhase } from '../lib/experience'

const name = (language: string) => targetLanguages.find((item) => item.code === language)?.name ?? 'Original'

export function useDubPlayer(job: MediaJob | null, language: string) {
  const video = useRef<HTMLVideoElement | null>(null)
  const context = useRef<AudioContext | null>(null)
  const queue = useRef<AudioQueue | null>(null)
  const buffers = useRef(new Map<string, AudioBuffer>())
  const loading = useRef(new Set<string>())
  const downloadErrors = useRef(new Map<string, string>())
  const controllers = useRef(new Set<AbortController>())
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [status, setStatus] = useState<{ phase: PlaybackPhase; message: string }>({ phase: 'paused', message: 'Paused' })
  const [error, setError] = useState('')
  const [translationError, setTranslationError] = useState('')
  const [audioStarts, setAudioStarts] = useState(0)
  const [drift, setDrift] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [stalls, setStalls] = useState(0)
  const [activeLanguage, setActiveLanguage] = useState('original')
  const [activity, setActivity] = useState<string[]>([])
  const active = useRef('original')
  const desired = useRef(false)
  const finished = useRef(false)
  const latest = useRef({ job, language })
  const starting = useRef(false)
  const epoch = useRef(0)
  const selection = useRef(0)
  const requestMessage = useRef<string | null>(null)
  const lastRequest = useRef({ at: 0, position: -1 })
  useEffect(() => { latest.current = { job, language } }, [job, language])

  const stopVoice = useCallback(() => { queue.current?.stop(); queue.current = null }, [])
  const setState = useCallback((message: string, phase: PlaybackPhase) => {
    setStatus((previous) => previous.message === message && previous.phase === phase ? previous : { message, phase })
  }, [])
  const pause = useCallback(() => {
    desired.current = false; epoch.current++; video.current?.pause(); stopVoice(); setPlaying(false); setState('Paused', 'paused')
  }, [stopVoice, setState])
  const reset = useCallback(() => {
    pause(); buffers.current.clear(); loading.current.clear(); downloadErrors.current.clear(); finished.current = false
    for (const controller of controllers.current) controller.abort()
    controllers.current.clear(); active.current = 'original'; setActiveLanguage('original'); setActivity([]); setTime(0); setError(''); setTranslationError(''); setAudioStarts(0); setDrift(0); setBuffered(0); setStalls(0)
    selection.current++; requestMessage.current = null; lastRequest.current = { at: 0, position: -1 }
    if (video.current) { video.current.currentTime = 0; video.current.muted = false; video.current.playbackRate = 1 }
  }, [pause])

  const requestTrack = useCallback(async (id: string, target: string, retry = false) => {
    const version = ++selection.current
    const position = video.current?.currentTime ?? 0
    lastRequest.current = { at: Date.now(), position }
    try {
      const response = await fetch(`/api/media/${id}/tracks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: target, retry, selection: version, position }) })
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error ?? 'Media session expired or unavailable. Upload the video again.') }
      if (version === selection.current) requestMessage.current = ''
    } catch (caught) { if (version === selection.current) requestMessage.current = caught instanceof Error ? caught.message : 'Connection failed.' }
  }, [])
  const jobId = job?.id
  useEffect(() => { if (jobId) void requestTrack(jobId, language) }, [jobId, language, requestTrack])
  const seek = useCallback((next: number) => {
    epoch.current++; video.current?.pause(); stopVoice(); finished.current = false
    if (video.current) video.current.currentTime = next
    setTime(next)
    const current = latest.current
    if (current.job) void requestTrack(current.job.id, current.language)
  }, [stopVoice, requestTrack])
  const play = useCallback(() => {
    context.current ??= new AudioContext()
    void context.current.resume().catch(() => setError('Audio could not start. Press play again.'))
    if (finished.current || video.current?.ended) seek(0)
    finished.current = false; setError(''); desired.current = true; setPlaying(true)
  }, [seek])
  const toggle = useCallback(() => { if (desired.current) pause(); else play() }, [pause, play])
  const buffering = useCallback(() => { epoch.current++; stopVoice() }, [stopVoice])
  const retry = useCallback(() => {
    const current = latest.current
    if (current.job) {
      for (const key of downloadErrors.current.keys()) if (key.startsWith(`${current.job.id}/${current.language}/`)) downloadErrors.current.delete(key)
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
      const keyFor = (lang: string, chunk: AudioChunk) => `${current?.id}/${lang}/${chunk.index}`
      const available = (lang: string) => (chunk: AudioChunk) => buffers.current.has(keyFor(lang, chunk))

      // Send a playhead revision, not a growing queue of requests for old choices.
      if (current && target !== 'original' && targetTrack?.state !== 'ready' && Date.now() - lastRequest.current.at > 2000 && Math.abs(position - lastRequest.current.position) > 1) void requestTrack(current.id, target)

      const protectedKeys = new Set<string>()
      for (const lang of new Set([target, active.current])) {
        const chunks = current?.tracks[lang]?.segments ?? []
        const near = chunks.filter((chunk) => chunk.end > position && chunk.start < position + 30).slice(0, 5)
        for (const chunk of near) {
          const key = keyFor(lang, chunk); protectedKeys.add(key)
          if (buffers.current.has(key) || loading.current.has(key) || downloadErrors.current.has(key) || localControllers.size >= 4) continue
          context.current ??= new AudioContext()
          loading.current.add(key)
          const controller = new AbortController(); localControllers.add(controller)
          void fetch(chunk.audioUrl, { signal: controller.signal }).then(async (response) => {
            if (!response.ok) throw new Error('An audio section could not be downloaded. Retry the stream.')
            const buffer = await context.current!.decodeAudioData(await response.arrayBuffer())
            if (!controller.signal.aborted && latest.current.job?.id === current?.id) buffers.current.set(key, buffer)
          }).catch((caught: Error) => { if (!controller.signal.aborted) downloadErrors.current.set(key, caught.message) })
            .finally(() => { loading.current.delete(key); localControllers.delete(controller) })
        }
      }
      for (const key of buffers.current.keys()) {
        if (buffers.current.size <= 48) break
        if (!protectedKeys.has(key)) buffers.current.delete(key)
      }

      const ready = target === 'original' || canStartStream(targetTrack?.segments ?? [], position, current?.duration ?? 0, available(target))
      if (target !== active.current && ready) {
        epoch.current++; stopVoice(); active.current = target; setActiveLanguage(target); media.playbackRate = 1
        setActivity((items) => [`${name(target)} active at ${Math.floor(position)}s`, ...items].slice(0, 5))
      }
      const chunks = current?.tracks[active.current]?.segments ?? []
      media.muted = active.current !== 'original'
      const downloadError = [...downloadErrors.current.entries()].find(([key]) => key.startsWith(`${current?.id}/${target}/`))?.[1]
      const targetError = targetTrack?.error ?? downloadError
      setTranslationError(targetError ?? '')
      const preparation = target !== active.current ? targetError ? `${name(target)} needs attention · current audio unchanged` : `Buffering ${name(target)} near ${Math.floor(position)}s${desired.current ? ' · current audio continues' : ''}` : ''
      setBuffered(Math.round(bufferedAhead(chunks, position, available(active.current)) * 10) / 10)
      if (!desired.current || starting.current) { if (!desired.current) setState(finished.current ? 'Finished · press play to restart' : preparation || 'Paused', finished.current ? 'finished' : 'paused'); return }
      if (media.readyState < 3 || media.seeking) { stopVoice(); setState('Buffering video…', 'waiting-video'); return }

      if (active.current !== 'original') {
        if (!context.current || context.current.state !== 'running') { pause(); setError('Press play to enable translated audio.'); return }
        // Append before a section ends, scheduling on the shared audio clock.
        const appendAhead = () => {
          while (queue.current?.tail && queue.current.ahead < 20) {
            const next = chunks.find((chunk) => chunk.index === queue.current!.tail!.chunk.index + 1)
            const buffer = next && buffers.current.get(keyFor(active.current, next))
            if (!next || !buffer || !queue.current.append(next, buffer)) break
          }
        }
        appendAhead()
        if (queue.current?.exhausted) {
          const end = queue.current.tail!.chunk.end
          stopVoice(); media.pause(); media.currentTime = Math.min(end, media.duration)
          if (end >= (current?.duration ?? media.duration) - 0.05) { finished.current = true; pause(); setState('Finished · press play to restart', 'finished'); return }
          setStalls((count) => count + 1)
        }
        if (media.ended && queue.current) { setState('Finishing translated audio…', 'playing'); return }
        if (media.ended && !queue.current) { finished.current = true; pause(); setState('Finished · press play to restart', 'finished'); return }
        if (!queue.current && !canStartStream(chunks, media.currentTime, current?.duration ?? 0, available(active.current))) {
          media.pause(); setState(`Buffering the next ${name(active.current)} phrase…`, 'waiting-audio'); return
        }
      } else if (media.ended) { finished.current = true; pause(); setState('Finished · press play to restart', 'finished'); return }

      if (media.paused) {
        starting.current = true; const version = epoch.current
        try { await media.play(); if (version !== epoch.current || !desired.current) { media.pause(); return } }
        catch { pause(); setError('Press play again to start the video.'); return }
        finally { starting.current = false }
      }
      if (active.current !== 'original' && context.current) {
        if (!queue.current) {
          const chunk = chunkAt(chunks, media.currentTime)
          const buffer = chunk && buffers.current.get(keyFor(active.current, chunk))
          if (!chunk || !buffer) { media.pause(); return }
          queue.current = new AudioQueue(context.current)
          queue.current.append(chunk, buffer, media.currentTime)
          setAudioStarts((count) => count + 1)
        }
        const clock = queue.current.clock()
        if (clock) { setDrift(Math.round((clock.position - media.currentTime) * 1000)); media.playbackRate = clock.rate * videoCorrection(clock.position, media.currentTime) }
      } else { media.playbackRate = 1; setDrift(0) }
      setState(preparation ? `Playing ${name(active.current)} · ${preparation}` : `Playing ${name(active.current)}${active.current !== 'original' ? ' · progressive stream' : ''}`, 'playing')
    }
    const interval = setInterval(() => { void tick() }, 40)
    return () => { clearInterval(interval); for (const controller of localControllers) controller.abort(); stopVoice() }
  }, [pause, stopVoice, requestTrack, setState])

  return { videoRef: video, playing, time, state: status.message, phase: status.phase, error, translationError, audioStarts, drift, buffered, stalls, activeLanguage, activity, play, toggle, pause, reset, seek, buffering, retry }
}
