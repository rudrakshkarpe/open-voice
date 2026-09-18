import { useCallback, useEffect, useRef, useState } from 'react'
import { apiUrl } from '../lib/api'

export type Segment = { index: number; start: number; end: number; state: 'pending' | 'ready' | 'error'; text: string; error?: string }
export type Track = { state: 'queued' | 'preparing' | 'paused' | 'ready' | 'error'; completed: number; total: number; message: string; segments: { index: number; start: number; end: number; text: string; audioStart: number; audioEnd: number; captionEnd: number; audioUrl: string }[]; error?: string; maxSpeed?: number; duration?: number; slowedSections?: number }
export type MediaJob = { id: string; name: string; status: 'importing' | 'extracting' | 'transcribing' | 'ready' | 'error'; error?: string; duration: number;
  width: number; height: number; sampleRate: number; rmsDb?: number; peakDb?: number; language: string | null; segments: Segment[]; tracks: Record<string, Track>; extractedAudioUrl?: string; videoUrl?: string; message?: string }

export function useMediaSession() {
  const [job, setJob] = useState<MediaJob | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
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
      stream.onerror = () => { if (current.current === jobId) setError('Progress connection interrupted. Reconnecting…') }
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
    current.current = null; setJob(null); setError(''); setUploading(false)
  }, [])
  const submit = useCallback(async (file: File | string) => {
    clear()
    const version = revision.current
    setUploading(true)
    const controller = new AbortController(); abort.current = controller
    try {
      const form = new FormData(); if (typeof file !== 'string') form.append('file', file)
      const response = await fetch(apiUrl(typeof file === 'string' ? '/api/media/youtube' : '/api/media'), {
        method: 'POST', body: typeof file === 'string' ? JSON.stringify({ url: file }) : form,
        headers: typeof file === 'string' ? { 'Content-Type': 'application/json' } : undefined, signal: controller.signal,
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Upload failed.')
      if (version !== revision.current) return
      current.current = payload.id; setJob(payload)
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Upload failed.')
    } finally { if (version === revision.current) setUploading(false) }
  }, [clear])

  return { job, upload: submit, importUrl: submit, uploading, error, clear }
}
