import { Router } from 'express'
import multer from 'multer'
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { detectLanguage } from './language.js'
import { SAMPLE_RATE, segmentAudio, signalStats } from './audio.js'
import { transcribe, translate, synthesize } from './boson.js'

const run = promisify(execFile)
const root = await mkdtemp(path.join(tmpdir(), 'openvoice-'))
const upload = multer({ dest: root, limits: { fileSize: 200 * 1024 * 1024, files: 1 } })
const languages: Record<string, string> = { en: 'English', es: 'Spanish', hi: 'Hindi', fr: 'French', de: 'German', pt: 'Portuguese', ja: 'Japanese', ko: 'Korean', zh: 'Mandarin Chinese', ar: 'Arabic', it: 'Italian', ru: 'Russian', ta: 'Tamil', te: 'Telugu', mr: 'Marathi', bn: 'Bengali', gu: 'Gujarati', ur: 'Urdu', tr: 'Turkish', vi: 'Vietnamese', id: 'Indonesian', nl: 'Dutch', pl: 'Polish', uk: 'Ukrainian', sv: 'Swedish', th: 'Thai' }

type Segment = { index: number; start: number; end: number; rmsDb: number; state: 'pending' | 'ready' | 'error'; text: string; error?: string }
type Dub = { state: 'translating' | 'synthesizing' | 'ready' | 'error'; text: string; audioUrl?: string; error?: string }
type Job = {
  id: string; directory: string; createdAt: number; controller: AbortController;
  status: 'extracting' | 'transcribing' | 'ready' | 'error'; error?: string;
  name: string; duration: number; width: number; height: number; sampleRate: number;
  rmsDb?: number; peakDb?: number; language: string | null; segments: Segment[];
  dubs: Record<string, Dub>; listeners: Set<(data: string) => void>;
}
const jobs = new Map<string, Job>()
const view = (job: Job) => ({ id: job.id, name: job.name, status: job.status, error: job.error, duration: job.duration, width: job.width, height: job.height,
  sampleRate: job.sampleRate, rmsDb: job.rmsDb, peakDb: job.peakDb, language: job.language, segments: job.segments, dubs: job.dubs,
  extractedAudioUrl: job.status !== 'extracting' && job.rmsDb !== undefined ? `/api/media/${job.id}/source.wav` : undefined })
const publish = (job: Job) => { const data = JSON.stringify(view(job)); for (const listener of job.listeners) listener(data) }
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Processing failed.'

async function processMedia(job: Job, file: string) {
  try {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { signal: job.controller.signal, timeout: 20000, maxBuffer: 1024 * 1024 })
    const info = JSON.parse(stdout)
    const audio = info.streams.find((stream: { codec_type: string }) => stream.codec_type === 'audio')
    const video = info.streams.find((stream: { codec_type: string }) => stream.codec_type === 'video')
    if (!audio) throw new Error('This file has no audio track. Choose a video with speech.')
    job.duration = Number(info.format.duration)
    if (!Number.isFinite(job.duration) || job.duration <= 0 || job.duration > 600) throw new Error('Use a clip between 1 second and 10 minutes for this demo.')
    job.width = video?.width ?? 0; job.height = video?.height ?? 0
    const pcmFile = path.join(job.directory, 'source.pcm')
    await run('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 's16le', pcmFile], { signal: job.controller.signal, timeout: 120000 })
    const pcm = await readFile(pcmFile)
    Object.assign(job, signalStats(pcm))
    if (!pcm.length || (job.peakDb ?? -180) < -60) throw new Error('The extracted track is silent. Choose a clip with audible speech.')
    await run('ffmpeg', ['-v', 'error', '-nostdin', '-f', 's16le', '-ar', String(SAMPLE_RATE), '-ac', '1', '-i', pcmFile, path.join(job.directory, 'source.wav')], { signal: job.controller.signal, timeout: 30000 })
    job.segments = segmentAudio(pcm).map((segment) => ({ ...segment, text: '', state: 'pending' }))
    job.status = 'transcribing'; publish(job)
    for (const segment of job.segments) {
      if (job.controller.signal.aborted) return
      try {
        if (segment.rmsDb > -48) segment.text = await transcribe(pcm.subarray(Math.round(segment.start * SAMPLE_RATE) * 2, Math.round(segment.end * SAMPLE_RATE) * 2), job.controller.signal)
        segment.state = 'ready'
        const evidence = job.segments.filter((s) => s.state === 'ready').map((s) => s.text).join(' ')
        job.language = detectLanguage(evidence) ?? job.language
      } catch (error) { segment.state = 'error'; segment.error = errorText(error) }
      publish(job)
    }
    job.status = job.segments.every((segment) => segment.state === 'error') ? 'error' : 'ready'
    if (job.status === 'error') job.error = job.segments[0]?.error ?? 'Transcription failed.'
    publish(job)
  } catch (error) {
    if (!job.controller.signal.aborted) { job.status = 'error'; job.error = errorText(error); publish(job) }
  } finally { await rm(file, { force: true }) }
}

// Bound provider concurrency, including prefetches; never fan out on every frame.
let activeDubs = 0
const queue: (() => Promise<void>)[] = []
function drain() {
  while (activeDubs < 1 && queue.length) {
    activeDubs++
    void queue.shift()!().finally(() => { activeDubs--; drain() })
  }
}

export const mediaRouter = Router()
mediaRouter.post('/', upload.single('file'), async (request, response) => {
  if (!request.file) return response.status(400).json({ error: 'Choose an audio or video file.' })
  if ([...jobs.values()].filter((j) => j.status === 'extracting' || j.status === 'transcribing').length >= 2) {
    await rm(request.file.path, { force: true }); return response.status(429).json({ error: 'Two files are already processing. Please wait.' })
  }
  const id = randomUUID(); const directory = path.join(root, id)
  await mkdir(directory)
  const job: Job = { id, directory, createdAt: Date.now(), controller: new AbortController(), status: 'extracting', name: request.file.originalname,
    duration: 0, width: 0, height: 0, sampleRate: SAMPLE_RATE, language: null, segments: [], dubs: {}, listeners: new Set() }
  jobs.set(id, job)
  response.status(202).json(view(job))
  void processMedia(job, request.file.path)
})
mediaRouter.get('/:id', (request, response) => { const job = jobs.get(request.params.id); return job ? response.json(view(job)) : response.status(404).json({ error: 'Media session expired. Upload it again.' }) })
mediaRouter.get('/:id/events', (request, response) => {
  const job = jobs.get(request.params.id)
  if (!job) return response.sendStatus(404)
  response.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' }); response.flushHeaders()
  const listener = (data: string) => response.write(`data: ${data}\n\n`)
  job.listeners.add(listener); listener(JSON.stringify(view(job)))
  const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15000)
  request.on('close', () => { clearInterval(heartbeat); job.listeners.delete(listener) })
})
mediaRouter.get('/:id/source.wav', (request, response) => {
  const job = jobs.get(request.params.id)
  if (!job) return response.sendStatus(404)
  response.set('Cache-Control', 'no-store').sendFile(path.join(job.directory, 'source.wav'))
})
mediaRouter.post('/:id/translate', (request, response) => {
  const job = jobs.get(request.params.id)
  const { index, language } = request.body
  if (!job) return response.sendStatus(404)
  if (!Number.isInteger(index) || typeof language !== 'string' || !languages[language]) return response.status(400).json({ error: 'Invalid segment or language.' })
  const segment = job.segments[index]
  if (!segment || segment.state !== 'ready') return response.status(409).json({ error: segment?.error ?? 'Source transcript is still processing.' })
  const key = `${index}-${language}`
  if (job.dubs[key] && job.dubs[key].state !== 'error') return response.json(job.dubs[key])
  const dub: Dub = { state: 'translating', text: '' }; job.dubs[key] = dub
  response.status(202).json(dub); publish(job)
  queue.push(async () => {
    if (job.controller.signal.aborted) return
    try {
      if (segment.text.trim()) {
        dub.text = await translate(segment.text, languages[language], job.controller.signal, (text) => { dub.text = text; publish(job) })
        dub.state = 'synthesizing'; publish(job)
        const audio = await synthesize(dub.text, job.controller.signal)
        await writeFile(path.join(job.directory, `${key}.mp3`), audio)
        dub.audioUrl = `/api/media/${job.id}/audio/${key}.mp3`
      }
      dub.state = 'ready'
    } catch (error) { dub.state = 'error'; dub.error = errorText(error) }
    publish(job)
  }); drain()
})
mediaRouter.get('/:id/audio/:file', (request, response) => {
  const job = jobs.get(request.params.id)
  if (!job || !/^\d+-[a-z]{2}\.mp3$/.test(request.params.file)) return response.sendStatus(404)
  response.set('Cache-Control', 'private, max-age=3600').sendFile(path.join(job.directory, request.params.file))
})
async function removeJob(job: Job) {
  job.controller.abort(); jobs.delete(job.id)
  // Work may be unwinding; temp files are confined to this generated directory.
  await rm(job.directory, { recursive: true, force: true }).catch(() => undefined)
}
mediaRouter.delete('/:id', async (request, response) => {
  const job = jobs.get(request.params.id); if (job) await removeJob(job)
  response.sendStatus(204)
})
setInterval(() => { for (const job of jobs.values()) if (Date.now() - job.createdAt > 3600000 && !job.listeners.size) void removeJob(job) }, 60000).unref()
