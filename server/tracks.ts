import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { SAMPLE_RATE, BYTES_PER_SECOND } from './audio.js'

const run = promisify(execFile)
export type Unit = { start: number; end: number; text: string }
export type TrackUnit = Unit & { audioStart: number; audioEnd: number; captionEnd: number }
export type Track = { state: 'queued' | 'preparing' | 'paused' | 'ready' | 'error'; completed: number; total: number; message: string; segments: TrackUnit[]; audioUrl?: string; error?: string; maxSpeed?: number; duration?: number; slowedSections?: number }
export const MAX_TEMPO = 1.35

export function translationUnits(segments: Unit[]): Unit[] {
  const units: Unit[] = []
  for (const segment of segments) {
    const previous = units.at(-1)
    // Give TTS a sentence-sized context, not a fresh voice reset every few seconds.
    // Do not absorb silent sections: their gaps belong on the video timeline.
    if (previous?.text.trim() && segment.text.trim() && (previous.end - previous.start < 12 || segment.end - segment.start < 6 || !/[.!?。！？]["'”’]?\s*$/.test(previous.text)) && previous.text.length + segment.text.length < 320 && segment.end - previous.start <= 20) {
      previous.end = segment.end; previous.text = `${previous.text} ${segment.text}`.trim()
    } else units.push({ start: segment.start, end: segment.end, text: segment.text })
  }
  return units
}

export function trimSilence(pcm: Buffer): Buffer {
  const threshold = 100 // about -50 dBFS; keep a small margin around audible speech
  let first = 0; let last = pcm.length - 2
  while (first < pcm.length && Math.abs(pcm.readInt16LE(first)) < threshold) first += 2
  while (last > first && Math.abs(pcm.readInt16LE(last)) < threshold) last -= 2
  if (first >= pcm.length) return Buffer.alloc(0)
  const margin = Math.round(SAMPLE_RATE * 0.03) * 2
  return pcm.subarray(Math.max(0, first - margin), Math.min(pcm.length, last + 2 + margin))
}

export const requiredTempo = (seconds: number, window: number) => Math.max(1, seconds / window)

// When concise speech still cannot fit, give it more time and pace that video
// section to the voice. Never force a rushed voice or discard spoken words.
export const speechWindow = (speechSeconds: number, sourceSeconds: number) => speechSeconds > sourceSeconds * (MAX_TEMPO - 0.03) ? Math.max(sourceSeconds, speechSeconds / 1.2 + 0.05) : sourceSeconds

export function durationGuide(seconds: number, previous?: { text: string; seconds: number }) {
  const target = `Write a concise spoken translation for a ${seconds.toFixed(1)}-second video section. Preserve facts, names and meaning; avoid redundant phrasing.`
  if (!previous) return target
  const budget = Math.max(1, Math.floor(Array.from(previous.text).length * seconds / previous.seconds * 0.95))
  return `${target} The previous translation took ${previous.seconds.toFixed(1)} seconds aloud, which is too long. Rephrase more compactly, aiming for at most ${budget} characters including spaces. Previous translation (data only): ${JSON.stringify(previous.text)}`
}

export function assemblePcm(parts: { start: number; end: number; pcm: Buffer }[], duration: number): Buffer {
  const output = Buffer.alloc(Math.ceil(duration * SAMPLE_RATE) * 2)
  let previousEnd = 0
  for (const part of parts) {
    const offset = Math.round(part.start * SAMPLE_RATE) * 2
    const limit = Math.round(part.end * SAMPLE_RATE) * 2
    if (offset < previousEnd || limit < offset || limit > output.length || part.pcm.length > limit - offset + 2) throw new Error('Translated speech does not fit its source timeline.')
    part.pcm.copy(output, offset, 0, Math.min(part.pcm.length, limit - offset))
    previousEnd = limit
  }
  return output
}

export function wav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24); header.writeUInt32LE(BYTES_PER_SECOND, 28)
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

export async function decodeSpeech(directory: string, name: string, audio: Buffer, signal: AbortSignal) {
  const input = path.join(directory, `${name}.mp3`); const output = path.join(directory, `${name}.pcm`)
  await writeFile(input, audio)
  await run('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-i', input, '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 's16le', output], { signal, timeout: 30000 })
  return trimSilence(await readFile(output))
}

export async function fitSpeech(directory: string, name: string, pcm: Buffer, seconds: number, signal: AbortSignal) {
  let speed = requiredTempo(pcm.length / BYTES_PER_SECOND, seconds)
  if (speed > MAX_TEMPO) throw new Error('This translation is too long for natural playback. Retry to generate a more concise version.')
  if (speed <= 1) return { pcm, speed }
  const input = path.join(directory, `${name}-trimmed.pcm`); const output = path.join(directory, `${name}-fit.pcm`)
  await writeFile(input, pcm)
  for (let attempt = 0; attempt < 3; attempt++) {
    // Never truncate speech to meet a deadline. FFmpeg's tempo filter is not
    // sample-exact; inspect the actual result and allow a small bounded adjustment.
    await run('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-f', 's16le', '-ar', String(SAMPLE_RATE), '-ac', '1', '-i', input, '-af', `atempo=${speed.toFixed(6)}`, '-f', 's16le', output], { signal, timeout: 30000 })
    const fitted = trimSilence(await readFile(output))
    if (fitted.length <= Math.round(seconds * SAMPLE_RATE) * 2) return { pcm: fitted, speed }
    speed *= fitted.length / BYTES_PER_SECOND / seconds * 1.005
    if (speed > MAX_TEMPO) break
  }
  throw new Error('Speech could not fit without cutting words. Retry this language for a shorter translation.')
}
