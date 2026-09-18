import { useCallback, useEffect, useRef, useState } from 'react'
import type { MediaJob } from './useMediaSession'

export function useDubPlayer(job: MediaJob | null, language: string) {
  const video = useRef<HTMLVideoElement | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [state, setState] = useState('Paused')
  const [error, setError] = useState('')
  const desired = useRef(false)
  const latest = useRef({ job, language })
  const track = useRef('')
  const requested = useRef(new Set<string>())
  const starting = useRef(false)
  const epoch = useRef(0)
  useEffect(() => { latest.current = { job, language } }, [job, language])

  const pause = useCallback(() => {
    desired.current = false; epoch.current++; video.current?.pause(); audio.current?.pause(); setPlaying(false); setState('Paused')
  }, [audio, video])
  const reset = useCallback(() => {
    pause(); track.current = ''; requested.current.clear(); setTime(0); setError('')
    if (video.current) { video.current.currentTime = 0; video.current.muted = false; video.current.playbackRate = 1 }
    if (audio.current) { audio.current.removeAttribute('src'); audio.current.load() }
  }, [audio, video, pause])
  const seek = useCallback((next: number) => {
    epoch.current++; video.current?.pause(); audio.current?.pause(); track.current = ''
    if (video.current) video.current.currentTime = next
    setTime(next)
  }, [audio, video])
  const toggle = useCallback(() => {
    if (desired.current) pause()
    else { setError(''); desired.current = true; setPlaying(true) }
  }, [pause])

  useEffect(() => {
    // Invalidate old speech immediately when a different language is selected.
    epoch.current++; track.current = ''; audio.current?.pause(); video.current?.pause()
  }, [language, audio, video])

  useEffect(() => {
    let lastVideo: HTMLVideoElement | null = null
    let lastAudio: HTMLAudioElement | null = null
    const tick = async () => {
      const media = video.current; const speech = audio.current
      if (!media || !speech) return
      lastVideo = media; lastAudio = speech
      const { job: current, language: target } = latest.current
      const position = media.currentTime
      setTime(position)
      if (!desired.current || starting.current) return
      if (media.ended || (current && position >= current.duration - 0.04)) { pause(); setState('Finished'); return }
      const wait = (message: string) => { media.pause(); speech.pause(); setState(message) }
      if (target === 'original') {
        speech.pause(); media.muted = false; media.playbackRate = 1
        if (media.paused) { starting.current = true; try { await media.play() } catch { pause(); setError('Press play again to start this media.') } finally { starting.current = false } }
        setState('Playing original'); return
      }
      media.muted = true
      if (!current) return wait('Preparing audio…')
      const segment = current.segments.find((s) => position >= s.start && position < s.end)
      if (!segment) return wait(current.error ?? 'Extracting audio…')
      if (segment.state === 'error') { pause(); setError(segment.error ?? 'Transcription failed. Replace the file to retry.'); return }
      if (segment.state !== 'ready') return wait('Transcribing this section…')

      for (const candidate of current.segments.slice(segment.index, segment.index + 2)) {
        const key = `${candidate.index}-${target}`; const requestKey = `${current.id}/${key}`
        if (candidate.state !== 'ready' || current.dubs[key] || requested.current.has(requestKey)) continue
        requested.current.add(requestKey)
        void fetch(`/api/media/${current.id}/translate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index: candidate.index, language: target }) })
          .then(async (response) => { if (!response.ok) { const body = await response.json(); throw new Error(body.error ?? 'Translation request failed.') } })
          .catch((caught: Error) => { if (latest.current.job?.id === current.id && latest.current.language === target) { pause(); setError(caught.message) } })
      }
      const dub = current.dubs[`${segment.index}-${target}`]
      if (dub?.state === 'error') { pause(); setError(dub.error ?? 'Translation failed.'); return }
      if (!dub || dub.state !== 'ready') return wait(dub?.state === 'synthesizing' ? 'Preparing translated voice…' : 'Translating this section…')
      if (!dub.audioUrl) {
        speech.pause(); media.playbackRate = 1
        if (media.paused) await media.play().catch(() => { pause(); setError('Press play to continue.') })
        setState('Playing'); return
      }
      const nextTrack = `${current.id}/${segment.index}/${target}`
      if (track.current !== nextTrack) {
        wait('Loading translated voice…'); track.current = nextTrack; speech.src = dub.audioUrl; speech.load(); return
      }
      if (speech.readyState < 2 || !Number.isFinite(speech.duration)) return wait('Loading translated voice…')
      const ratio = speech.duration / (segment.end - segment.start)
      if (ratio < 0.125 || ratio > 8) { pause(); setError('Generated speech has an unexpected duration. Switch to Original or retry this translation.'); return }
      // Keep both media clocks aligned. Limit speech stretching, slowing video if required.
      speech.playbackRate = Math.max(0.5, Math.min(2, ratio))
      media.playbackRate = speech.playbackRate / ratio
      const expected = Math.min(speech.duration - 0.01, Math.max(0, (position - segment.start) * ratio))
      if (Math.abs(speech.currentTime - expected) > 0.25) speech.currentTime = expected
      if (media.paused || speech.paused) {
        starting.current = true; const version = epoch.current
        try {
          await Promise.all([speech.play(), media.play()])
          if (version !== epoch.current || !desired.current) { speech.pause(); media.pause() }
        } catch { pause(); setError('Playback was interrupted. Press play to retry.') }
        finally { starting.current = false }
      }
      setState('Playing translation')
    }
    const interval = setInterval(() => { void tick() }, 80)
    return () => { clearInterval(interval); lastVideo?.pause(); lastAudio?.pause() }
  }, [audio, video, pause])

  return { videoRef: video, audioRef: audio, playing, time, state, error, toggle, pause, reset, seek }
}
