import { useCallback, useEffect, useRef, useState } from 'react'

export type Segment = { index: number; start: number; end: number; state: 'pending' | 'ready' | 'error'; text: string; error?: string }
export type Dub = { state: 'translating' | 'synthesizing' | 'ready' | 'error'; text: string; audioUrl?: string; error?: string }
export type MediaJob = { id: string; name: string; status: 'extracting' | 'transcribing' | 'ready' | 'error'; error?: string; duration: number;
  width: number; height: number; sampleRate: number; rmsDb?: number; peakDb?: number; language: string | null; segments: Segment[]; dubs: Record<string, Dub>; extractedAudioUrl?: string }

export function useMediaSession() {
  const [job, setJob] = useState<MediaJob | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const events = useRef<EventSource | null>(null)
  const abort = useRef<AbortController | null>(null)
  const current = useRef<string | null>(null)
  const revision = useRef(0)

  useEffect(() => () => { events.current?.close(); abort.current?.abort() }, [])
  const upload = useCallback(async (file: File) => {
    const version = ++revision.current
    abort.current?.abort(); events.current?.close()
    const previous = current.current
    if (previous) void fetch(`/api/media/${previous}`, { method: 'DELETE' })
    current.current = null; setJob(null); setError(''); setUploading(true)
    const controller = new AbortController(); abort.current = controller
    try {
      const form = new FormData(); form.append('file', file)
      const response = await fetch('/api/media', { method: 'POST', body: form, signal: controller.signal })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Upload failed.')
      if (version !== revision.current) return
      current.current = payload.id; setJob(payload)
      const stream = new EventSource(`/api/media/${payload.id}/events`); events.current = stream
      stream.onmessage = (message) => { if (version === revision.current) { setJob(JSON.parse(message.data)); setError('') } }
      stream.onerror = () => { if (version === revision.current) setError('Progress connection interrupted. Reconnecting…') }
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Upload failed.')
    } finally { if (version === revision.current) setUploading(false) }
  }, [])

  return { job, upload, uploading, error }
}
