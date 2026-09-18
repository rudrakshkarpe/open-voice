import { useCallback, useEffect, useRef, useState } from 'react'
import { apiUrl } from '../lib/api'
import { requestImport } from '../lib/importRequest'

export type Segment = { index: number; start: number; end: number; state: 'pending' | 'ready' | 'error'; text: string; error?: string }
export type Track = { state: 'queued' | 'preparing' | 'paused' | 'ready' | 'error'; completed: number; total: number; message: string; segments: { index: number; start: number; end: number; text: string; audioStart: number; audioEnd: number; captionEnd: number; audioUrl: string }[]; error?: string; maxSpeed?: number; duration?: number; slowedSections?: number }
export type MediaJob = { id: string; name: string; status: 'queued' | 'importing' | 'extracting' | 'transcribing' | 'ready' | 'error'; error?: string; duration: number;
  width: number; height: number; sampleRate: number; rmsDb?: number; peakDb?: number; language: string | null; segments: Segment[]; tracks: Record<string, Track>; extractedAudioUrl?: string; videoUrl?: string; message?: string }

export function useMediaSession() {
  const [job, setJob] = useState<MediaJob | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const events = useRef<EventSource | null>(null)
  const abort = useRef<AbortController | null>(null)
  const current = useRef<string | null>(null)
  const revision = useRef(0)

  const jobId = job?.id ?? null
  useEffect(() => {
    const stream = jobId ? new EventSource(apiUrl(`/api/media/${jobId}/events`)) : null
    events.current = stream
    if (stream) {
      stream.onmessage = (message) => { if (current.current === jobId) { setJob(JSON.parse(message.data)); setError('') } }
      let checking = false
      stream.onerror = () => {
        if (current.current !== jobId || checking) return
        setError('Progress connection interrupted. Reconnecting…')
        checking = true
        void fetch(apiUrl(`/api/media/${jobId}`)).then((response) => {
          if (current.current === jobId && response.status === 404) {
            stream.close(); setError('This media session expired or the server restarted. Please open the video again.')
          }
        }).catch(() => undefined).finally(() => { checking = false })
      }
    }
    return () => {
      stream?.close()
      // A new upload may already own the controller by the time cleanup runs.
      if (current.current === jobId) abort.current?.abort()
    }
  }, [jobId])
  const clear = useCallback(() => {
    revision.current++
    abort.current?.abort(); events.current?.close()
    const previous = current.current
    if (previous) void fetch(apiUrl(`/api/media/${previous}`), { method: 'DELETE' }).catch(() => undefined)
    current.current = null; setJob(null); setError(''); setMessage(''); setUploading(false)
  }, [])
  const submit = useCallback(async (file: File | string) => {
    clear()
    const version = revision.current
    setUploading(true); setMessage(typeof file === 'string' ? 'Connecting to the video server…' : 'Uploading your file…')
    const controller = new AbortController(); abort.current = controller
    try {
      const form = new FormData(); if (typeof file !== 'string') form.append('file', file)
      const payload = await requestImport(apiUrl(typeof file === 'string' ? '/api/media/youtube' : '/api/media'), {
        method: 'POST', body: typeof file === 'string' ? JSON.stringify({ url: file }) : form,
        headers: typeof file === 'string' ? { 'Content-Type': 'application/json' } : undefined, signal: controller.signal,
      }, controller.signal, (text) => { if (version === revision.current) setMessage(text) })
      if (version !== revision.current) return
      current.current = payload.id; setJob(payload)
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Upload failed.')
    } finally { if (version === revision.current) { setUploading(false); setMessage('') } }
  }, [clear])

  return { job, upload: submit, importUrl: submit, uploading, message, error, clear }
}
