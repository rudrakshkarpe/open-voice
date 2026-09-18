import { Router } from 'express'
import multer from 'multer'
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { detectLanguage } from './language.js'
import { SAMPLE_RATE, BYTES_PER_SECOND, segmentAudio, signalStats } from './audio.js'
import { transcribe, translate, synthesize } from './boson.js'
import { importYoutube, youtubeUrl } from './youtube.js'
import { assemblePcm, decodeSpeech, durationGuide, fitSpeech, nextUnit, speechWindow, wav } from './tracks.js'
import type { Track } from './tracks.js'
import { WorkQueue } from './workQueue.js'
import { MAX_SESSIONS, sessionExpired } from './sessionPolicy.js'

const run = promisify(execFile)
const root = await mkdtemp(path.join(tmpdir(), 'openvoice-'))
const upload = multer({ dest: root, limits: { fileSize: 200 * 1024 * 1024, files: 1 } })
const languages: Record<string, string> = { en: 'English', es: 'Spanish', hi: 'Hindi', fr: 'French', de: 'German', pt: 'Portuguese', ja: 'Japanese', ko: 'Korean', zh: 'Mandarin Chinese', ar: 'Arabic', it: 'Italian', ru: 'Russian', ta: 'Tamil', te: 'Telugu', mr: 'Marathi', bn: 'Bengali', gu: 'Gujarati', ur: 'Urdu', tr: 'Turkish', vi: 'Vietnamese', id: 'Indonesian', nl: 'Dutch', pl: 'Polish', uk: 'Ukrainian', sv: 'Swedish', th: 'Thai' }

type Segment = { index: number; start: number; end: number; rmsDb: number; state: 'pending' | 'ready' | 'error'; text: string; error?: string }
type Job = {
  id: string; directory: string; lastSeenAt: number; controller: AbortController;
  status: 'queued' | 'importing' | 'extracting' | 'transcribing' | 'ready' | 'error'; error?: string; message?: string; videoUrl?: string;
  name: string; duration: number; width: number; height: number; sampleRate: number;
  rmsDb?: number; peakDb?: number; language: string | null; segments: Segment[];
  tracks: Record<string, Track>; requestedLanguage: string; selection: number; position: number; listeners: Set<(data: string) => void>;
}
const jobs = new Map<string, Job>()
const view = (job: Job) => ({ id: job.id, name: job.name, status: job.status, error: job.error, duration: job.duration, width: job.width, height: job.height,
  sampleRate: job.sampleRate, rmsDb: job.rmsDb, peakDb: job.peakDb, language: job.language, segments: job.segments, tracks: job.tracks, videoUrl: job.videoUrl, message: job.message,
  extractedAudioUrl: job.status !== 'extracting' && job.rmsDb !== undefined ? `/api/media/${job.id}/source.wav` : undefined })
const publish = (job: Job) => { const data = JSON.stringify(view(job)); for (const listener of job.listeners) listener(data) }
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Processing failed.'

async function processMedia(job: Job, file: string, keepVideo = false) {
  try {
    job.status = 'extracting'; job.message = 'Extracting audio…'; publish(job)
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
    job.duration = Math.max(job.duration, pcm.length / BYTES_PER_SECOND)
    Object.assign(job, signalStats(pcm))
    if (!pcm.length || (job.peakDb ?? -180) < -60) throw new Error('The extracted track is silent. Choose a clip with audible speech.')
    await run('ffmpeg', ['-v', 'error', '-nostdin', '-f', 's16le', '-ar', String(SAMPLE_RATE), '-ac', '1', '-i', pcmFile, path.join(job.directory, 'source.wav')], { signal: job.controller.signal, timeout: 30000 })
    job.segments = segmentAudio(pcm).map((segment) => ({ ...segment, text: '', state: 'pending' }))
    for (const track of Object.values(job.tracks)) track.total = job.segments.length
    job.status = 'transcribing'; job.message = 'Preparing captions…'; publish(job)
    for (const segment of job.segments) {
      if (job.controller.signal.aborted) return
      try {
        if (segment.rmsDb > -48) segment.text = await transcribe(pcm.subarray(Math.round(segment.start * SAMPLE_RATE) * 2, Math.round(segment.end * SAMPLE_RATE) * 2), job.controller.signal)
        segment.state = 'ready'
        const evidence = job.segments.filter((s) => s.state === 'ready').map((s) => s.text).join(' ')
        job.language = detectLanguage(evidence) ?? job.language
      } catch (error) { segment.state = 'error'; segment.error = errorText(error) }
      publish(job)
      schedule(job)
    }
    job.status = job.segments.every((segment) => segment.state === 'error') ? 'error' : 'ready'
    if (job.status === 'error') job.error = job.segments[0]?.error ?? 'Transcription failed.'
    publish(job)
    schedule(job)
  } catch (error) {
    if (!job.controller.signal.aborted) { job.status = 'error'; job.error = errorText(error); publish(job) }
  } finally { if (!keepVideo) await rm(file, { force: true }) }
}

// One provider request at a time avoids rate-limit storms. Re-select the desired
// language after every section, so abandoned choices cannot build a long queue.
let active = false
const queue: Job[] = []
function schedule(job: Job) {
  if (!queue.includes(job)) queue.push(job)
  drain()
}
function drain() {
  if (active) return
  const job = queue.shift()
  if (!job) return
  const language = job.requestedLanguage; const track = job.tracks[language]
  if (job.controller.signal.aborted || !['transcribing', 'ready'].includes(job.status) || !track || ['ready', 'error'].includes(track.state)) { drain(); return }
  if (nextUnit(job.segments, track.segments.map((unit) => unit.index), job.position) < 0) {
    if (job.status === 'ready' && job.segments.some((segment) => segment.state === 'error')) {
      track.state = 'error'; track.error = 'Some source sections could not be transcribed. Available translated sections can still play; re-upload to recover missing speech.'; publish(job)
    }
    drain(); return
  }
  active = true
  void prepareStep(job, language, track).finally(() => { active = false; schedule(job) })
}

async function prepareStep(job: Job, language: string, track: Track) {
  const signal = job.controller.signal
  try {
    track.state = 'preparing'; track.total = job.segments.length
    const index = nextUnit(job.segments, track.segments.map((unit) => unit.index), job.position)
    const unit = job.segments[index]
    if (unit) {
      track.message = `Translating ${index + 1}/${track.total}`; publish(job)
      let pcm: Buffer = Buffer.alloc(0); let text = ''; let speed = 1
      const seconds = unit.end - unit.start
      let window = seconds
      if (unit.text.trim()) {
        const context = JSON.stringify({ before: job.segments[index - 1]?.text ?? '', after: job.segments[index + 1]?.text ?? '' })
        text = await translate(unit.text, languages[language], signal, () => {}, `${durationGuide(seconds)} Neighbouring text is context only, not to be translated: ${context}`)
        track.message = `Generating voice ${index + 1}/${track.total}`; publish(job)
        pcm = await decodeSpeech(job.directory, `${language}-${index}`, await synthesize(text, signal), signal)
        if (!pcm.length) throw new Error('The speech provider returned silent audio. Retry this language.')
        if (pcm.length / BYTES_PER_SECOND > seconds * 3) throw new Error('The provider returned unexpectedly long speech. Retry this language.')
        window = speechWindow(pcm.length / BYTES_PER_SECOND, seconds)
        const fitted = await fitSpeech(job.directory, `${language}-${index}`, pcm, window, signal)
        pcm = fitted.pcm; speed = fitted.speed
      }
      // Publish an immutable, playable section immediately, not after the clip.
      const file = `chunk-${language}-${index}.wav`
      const padded = assemblePcm([{ start: 0, end: window, pcm }], window)
      await writeFile(path.join(job.directory, file), wav(padded))
      const audioEnd = padded.length / BYTES_PER_SECOND
      track.segments.push({ index, start: unit.start, end: unit.end, text, audioStart: 0, audioEnd, audioUrl: `/api/media/${job.id}/audio/${file}`, captionEnd: Math.min(unit.end, unit.start + pcm.length / BYTES_PER_SECOND / audioEnd * seconds) })
      track.segments.sort((a, b) => a.index - b.index)
      if (window > seconds + 0.01) track.slowedSections = (track.slowedSections ?? 0) + 1
      track.maxSpeed = Math.max(track.maxSpeed ?? 1, speed)
      track.completed++
    }
    if (track.completed === track.total) {
      track.duration = track.segments.reduce((sum, section) => sum + section.audioEnd, 0)
      track.state = 'ready'; track.message = 'All sections cached'
    } else if (job.requestedLanguage !== language) { track.state = 'paused'; track.message = 'Cached sections saved · select to continue' }
    else { track.message = `${track.completed}/${track.total} sections available · preparing ahead` }
    publish(job)
  } catch (error) {
    if (!signal.aborted) { track.state = 'error'; track.error = errorText(error); track.message = 'Preparation failed'; publish(job) }
  }
}

async function createJob(name: string, status: Job['status']) {
  const id = randomUUID(); const directory = path.join(root, id)
  await mkdir(directory)
  const job: Job = { id, directory, lastSeenAt: Date.now(), controller: new AbortController(), status, name,
    duration: 0, width: 0, height: 0, sampleRate: SAMPLE_RATE, language: null, segments: [], tracks: {}, requestedLanguage: 'original', selection: 0, position: 0, listeners: new Set() }
  jobs.set(id, job)
  return job
}
const sourceQueue = new WorkQueue(2)

export const mediaRouter = Router()
let incomingUploads = 0
// Reject before accepting large bodies; never let anonymous uploads fill disk.
mediaRouter.use((request, response, next) => {
  if (request.method !== 'POST' || !['/', '/youtube'].includes(request.path)) return next()
  for (const job of jobs.values()) if (sessionExpired(job.lastSeenAt, job.listeners.size)) void removeJob(job)
  if (jobs.size + incomingUploads >= MAX_SESSIONS || incomingUploads >= 2) return response.set('Retry-After', '5').status(503).json({ code: 'SERVER_BUSY', retryAfter: 5, error: 'All demo slots are occupied. Waiting for a slot to open…' })
  incomingUploads++
  let released = false
  const release = () => { if (!released) { released = true; incomingUploads-- } }
  response.once('finish', release); response.once('close', release)
  next()
})
mediaRouter.post('/', upload.single('file'), async (request, response) => {
  if (!request.file) return response.status(400).json({ error: 'Choose an audio or video file.' })
  const file = request.file.path
  const job = await createJob(request.file.originalname, 'queued')
  job.message = 'Waiting for a processing slot…'
  response.status(202).json(view(job))
  void sourceQueue.run(job.controller.signal, () => processMedia(job, file))
    .catch(() => rm(file, { force: true }).catch(() => undefined))
})
mediaRouter.post('/youtube', async (request, response) => {
  let url: string
  try { url = youtubeUrl(request.body?.url) } catch (error) { return response.status(400).json({ error: errorText(error) }) }
  const job = await createJob('YouTube video', 'queued')
  job.message = 'Waiting for a processing slot…'
  response.status(202).json(view(job))
  void sourceQueue.run(job.controller.signal, async () => {
    try {
      job.status = 'importing'; publish(job)
      const file = await importYoutube(url, job.directory, job.controller.signal, (message, title) => { job.message = message; if (title) job.name = title; publish(job) })
      job.videoUrl = `/api/media/${job.id}/video`; job.message = 'Preparing captions…'
      await processMedia(job, file, true)
    } catch (error) {
      if (!job.controller.signal.aborted) { job.status = 'error'; job.error = errorText(error); publish(job) }
    }
  }).catch(() => undefined) // Removing a waiting session cancels its queued work.
})
mediaRouter.get('/:id', (request, response) => { const job = jobs.get(request.params.id); if (job) job.lastSeenAt = Date.now(); return job ? response.json(view(job)) : response.status(404).json({ error: 'Media session expired. Upload it again.' }) })
mediaRouter.get('/:id/events', (request, response) => {
  const job = jobs.get(request.params.id)
  if (!job) return response.sendStatus(404)
  response.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' }); response.flushHeaders()
  const listener = (data: string) => response.write(`data: ${data}\n\n`)
  job.lastSeenAt = Date.now(); job.listeners.add(listener); listener(JSON.stringify(view(job)))
  const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15000)
  request.on('close', () => { clearInterval(heartbeat); job.listeners.delete(listener); job.lastSeenAt = Date.now() })
})
mediaRouter.get('/:id/source.wav', (request, response) => {
  const job = jobs.get(request.params.id)
  if (!job) return response.sendStatus(404)
  response.set('Cache-Control', 'no-store').sendFile(path.join(job.directory, 'source.wav'))
})
mediaRouter.get('/:id/video', (request, response) => {
  const job = jobs.get(request.params.id)
  if (!job?.videoUrl) return response.sendStatus(404)
  response.set('Cache-Control', 'private, max-age=3600').sendFile(path.join(job.directory, 'video.mp4'))
})
mediaRouter.post('/:id/tracks', (request, response) => {
  const job = jobs.get(request.params.id)
  const { language, retry, selection, position = 0 } = request.body ?? {}
  if (!job) return response.sendStatus(404)
  if (typeof language !== 'string' || (language !== 'original' && !languages[language])) return response.status(400).json({ error: 'Invalid language.' })
  if (!Number.isSafeInteger(selection) || selection < 0) return response.status(400).json({ error: 'Invalid selection revision.' })
  if (typeof position !== 'number' || !Number.isFinite(position) || position < 0 || position > 600) return response.status(400).json({ error: 'Invalid playback position.' })
  if (selection < job.selection) return response.status(202).json({ state: 'superseded' })
  if (process.env.NODE_ENV === 'production' && language !== 'original' && !job.tracks[language] && Object.keys(job.tracks).length >= 3) return response.status(429).json({ error: 'This public demo supports three translated languages per video. Start a new video to try others.' })
  job.selection = selection
  job.requestedLanguage = language
  job.position = position
  for (const [key, track] of Object.entries(job.tracks)) if (key !== language && track.state === 'queued') { track.state = 'paused'; track.message = 'Saved progress · select to resume' }
  if (language !== 'original') {
    if (!job.tracks[language]) job.tracks[language] = { state: 'queued', completed: 0, total: job.segments.length, message: 'Waiting for the first source section', segments: [] }
    const track = job.tracks[language]
    if (track.state === 'paused' || (retry && track.state === 'error')) { track.state = 'queued'; delete track.error; track.message = 'Queued for preparation' }
  }
  response.status(202).json(job.tracks[language] ?? { state: 'ready' }); publish(job); schedule(job)
})
mediaRouter.get('/:id/audio/:file', (request, response) => {
  const job = jobs.get(request.params.id)
  if (!job || !/^chunk-[a-z]{2}-\d+\.wav$/.test(request.params.file)) return response.sendStatus(404)
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
setInterval(() => { for (const job of jobs.values()) if (sessionExpired(job.lastSeenAt, job.listeners.size)) void removeJob(job) }, 15000).unref()
