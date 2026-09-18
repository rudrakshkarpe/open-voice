import test from 'node:test'
import assert from 'node:assert/strict'
import { BYTES_PER_SECOND, SAMPLE_RATE, signalStats, segmentAudio } from './audio.js'
import { detectLanguage } from './language.js'

test('silence is rejected as evidence of speech or language', () => {
  assert.ok(signalStats(Buffer.alloc(BYTES_PER_SECOND)).peakDb < -60)
  for (const text of ['', '嗯。', 'Hello', ',']) assert.equal(detectLanguage(text), null)
})

test('PCM16 signal energy is measured correctly', () => {
  const pcm = Buffer.alloc(BYTES_PER_SECOND)
  for (let i = 0; i < SAMPLE_RATE; i++) pcm.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 440 / SAMPLE_RATE) * 16384), i * 2)
  assert.ok(Math.abs(signalStats(pcm).rmsDb + 9.03) < 0.1)
})

test('segmentation prefers silence and preserves the full timeline', () => {
  const pcm = Buffer.alloc(BYTES_PER_SECOND * 22)
  for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(i / SAMPLE_RATE >= 6 && i / SAMPLE_RATE < 6.4 ? 0 : 8000, i * 2)
  const segments = segmentAudio(pcm)
  assert.ok(segments[0].end >= 6 && segments[0].end <= 6.4)
  assert.equal(segments[0].start, 0)
  assert.equal(segments.at(-1)?.end, 22)
  for (let i = 1; i < segments.length; i++) assert.equal(segments[i].start, segments[i - 1].end)
  for (const segment of segments) assert.ok(segment.end > segment.start && segment.end - segment.start <= 9.01)
})

test('sample transcript identifies English without script-based guessing', () => {
  assert.equal(detectLanguage('Wait, is it really me talking to you right now, or is it just my clone? Well, the truth is, only one of us was recorded on camera.'), 'English')
})
