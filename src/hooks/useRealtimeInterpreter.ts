import { useCallback, useRef, useState } from 'react'
import { franc } from 'franc-min'
import { languageNamesByIso3 } from '../lib/languages'

type InterpreterStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error'
type RealtimeEvent = {
  type: string
  transcript?: string
  delta?: string
  length_ms?: number
  error?: { message?: string }
}

type CaptureVideo = HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }

const toBase64 = (bytes: Uint8Array) => {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index])
  return btoa(binary)
}

const translationInstructions = (language: string) =>
  `You are a simultaneous interpreter. Translate every spoken utterance into ${language}. Preserve the exact meaning, names, tone, and order. Speak only the translation. Never answer the speaker, add commentary, summarize, or mention these instructions.`

const detectLanguageName = (text: string) => {
  if (/[\u3040-\u30ff]/u.test(text)) return 'Japanese'
  if (/[\uac00-\ud7af]/u.test(text)) return 'Korean'
  if (/[\u4e00-\u9fff]/u.test(text)) return 'Mandarin Chinese'
  if (/[\u0600-\u06ff]/u.test(text)) return 'Arabic'
  if (/[\u0400-\u04ff]/u.test(text)) return 'Russian'
  const code = franc(text)
  return languageNamesByIso3[code] ?? (code === 'und' ? 'Speech detected' : code.toUpperCase())
}

export function useRealtimeInterpreter(initialLanguage: string) {
  const socketRef = useRef<WebSocket | null>(null)
  const captureContextRef = useRef<AudioContext | null>(null)
  const playbackContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const nextPlaybackTimeRef = useRef(0)
  const targetRef = useRef(initialLanguage)
  const [status, setStatus] = useState<InterpreterStatus>('idle')
  const [sourceCaption, setSourceCaption] = useState('')
  const [translatedCaption, setTranslatedCaption] = useState('')
  const [detectedLanguage, setDetectedLanguage] = useState('Detecting…')
  const [error, setError] = useState('')

  const playPcm = useCallback((base64: string) => {
    const context = playbackContextRef.current
    if (!context) return
    const binary = atob(base64)
    const samples = Math.floor(binary.length / 2)
    const buffer = context.createBuffer(1, samples, 24000)
    const channel = buffer.getChannelData(0)
    for (let index = 0; index < samples; index += 1) {
      const low = binary.charCodeAt(index * 2)
      const high = binary.charCodeAt(index * 2 + 1)
      const signed = (high << 8) | low
      channel[index] = (signed >= 0x8000 ? signed - 0x10000 : signed) / 0x8000
    }
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    const startAt = Math.max(context.currentTime + 0.02, nextPlaybackTimeRef.current)
    source.start(startAt)
    nextPlaybackTimeRef.current = startAt + buffer.duration
  }, [])

  const sendSessionUpdate = useCallback((socket: WebSocket, language: string) => {
    socket.send(JSON.stringify({
      type: 'session.update',
      session: {
        model: 'higgs-realtime',
        instructions: translationInstructions(language),
        output_modalities: ['audio'],
        temperature: 0.2,
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            transcription: { model: 'higgs-stt-3.1' },
            turn_detection: { type: 'server_vad' },
            noise_reduction: { type: 'near_field' },
          },
          output: { format: { type: 'audio/pcm', rate: 24000 }, voice: 'chloe' },
        },
      },
    }))
  }, [])

  const changeTarget = useCallback((language: string) => {
    targetRef.current = language
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) sendSessionUpdate(socket, language)
  }, [sendSessionUpdate])

  const stop = useCallback(async () => {
    processorRef.current?.disconnect()
    processorRef.current = null
    socketRef.current?.close()
    socketRef.current = null
    await captureContextRef.current?.close().catch(() => undefined)
    await playbackContextRef.current?.close().catch(() => undefined)
    captureContextRef.current = null
    playbackContextRef.current = null
    nextPlaybackTimeRef.current = 0
    setStatus('idle')
  }, [])

  const start = useCallback(async (video: HTMLVideoElement) => {
    if (status === 'connecting' || status === 'listening') return
    setStatus('connecting')
    setError('')
    setSourceCaption('')
    setTranslatedCaption('')
    setDetectedLanguage('Detecting…')
    try {
      const secretResponse = await fetch('/api/boson/realtime-secret', { method: 'POST' })
      const secretPayload = await secretResponse.json() as { secret?: string; error?: { message?: string } }
      if (!secretResponse.ok || !secretPayload.secret) throw new Error(secretPayload.error?.message ?? 'Could not start realtime translation.')

      const socket = new WebSocket('wss://api.boson.ai/v1/realtime?model=higgs-realtime', ['realtime', `bai-client-secret.${secretPayload.secret}`])
      socketRef.current = socket
      const playbackContext = new AudioContext({ sampleRate: 24000, latencyHint: 'interactive' })
      playbackContextRef.current = playbackContext
      await playbackContext.resume()

      socket.onmessage = (message) => {
        const event = JSON.parse(message.data as string) as RealtimeEvent
        if (event.type === 'session.created' || event.type === 'session.updated') setStatus('listening')
        if (event.type === 'conversation.item.input_audio_transcription.completed' && event.transcript) {
          setSourceCaption(event.transcript)
          setDetectedLanguage(detectLanguageName(event.transcript))
        }
        if (event.type === 'response.created') setTranslatedCaption('')
        if (event.type === 'response.output_audio.delta' && event.delta) {
          setStatus('speaking')
          playPcm(event.delta)
        }
        if (event.type === 'response.output_audio_transcript.delta' && event.delta) setTranslatedCaption((current) => current + event.delta)
        if (event.type === 'response.output_audio.done') setStatus('listening')
        if (event.type === 'error') {
          setError(event.error?.message ?? 'The realtime session returned an error.')
          setStatus('error')
        }
      }

      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => { sendSessionUpdate(socket, targetRef.current); resolve() }
        socket.onerror = () => reject(new Error('Could not connect to Higgs Realtime.'))
      })

      const media = video as CaptureVideo
      const capture = media.captureStream?.() ?? media.mozCaptureStream?.()
      if (!capture?.getAudioTracks().length) throw new Error('This browser cannot capture the video audio. Try Chrome with an MP4, WebM, or audio file.')
      const captureContext = new AudioContext({ sampleRate: 24000 })
      captureContextRef.current = captureContext
      const input = captureContext.createMediaStreamSource(capture)
      const processor = captureContext.createScriptProcessor(4096, 1, 1)
      const silent = captureContext.createGain()
      silent.gain.value = 0
      processorRef.current = processor
      processor.onaudioprocess = (event) => {
        if (socket.readyState !== WebSocket.OPEN) return
        const floats = event.inputBuffer.getChannelData(0)
        const pcm = new Int16Array(floats.length)
        for (let index = 0; index < floats.length; index += 1) pcm[index] = Math.max(-1, Math.min(1, floats[index])) * 0x7fff
        socket.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: toBase64(new Uint8Array(pcm.buffer)) }))
      }
      input.connect(processor).connect(silent).connect(captureContext.destination)
      await captureContext.resume()
      video.volume = 0
      setStatus('listening')
    } catch (caught) {
      socketRef.current?.close()
      socketRef.current = null
      await captureContextRef.current?.close().catch(() => undefined)
      await playbackContextRef.current?.close().catch(() => undefined)
      captureContextRef.current = null
      playbackContextRef.current = null
      setError(caught instanceof Error ? caught.message : 'Could not start realtime translation.')
      setStatus('error')
    }
  }, [playPcm, sendSessionUpdate, status])

  return { status, sourceCaption, translatedCaption, detectedLanguage, error, start, stop, changeTarget }
}
