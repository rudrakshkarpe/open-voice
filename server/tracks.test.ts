import assert from 'node:assert/strict'
import test from 'node:test'
import { assemblePcm, durationGuide, fitSpeech, nextUnit, requiredTempo, speechWindow, trimSilence, wav } from './tracks.js'
import { BYTES_PER_SECOND } from './audio.js'

test('speech is never slowed to fill a section', () => {
  assert.equal(requiredTempo(4, 8), 1)
  assert.equal(requiredTempo(9, 8), 1.125)
})
test('overlong phrases get extra playback time instead of rushed speech', () => {
  assert.equal(speechWindow(8, 10), 10)
  assert.equal(speechWindow(13, 10), 10)
  assert.equal(speechWindow(18, 10), 15.05)
  assert.ok(requiredTempo(18, speechWindow(18, 10)) < 1.2)
})
test('translation prioritizes the playhead and upcoming sections, then backfills', () => {
  const sections = [0, 1, 2, 3].map((index) => ({ start: index * 5, end: (index + 1) * 5, text: 'Speech.', state: 'ready' }))
  assert.equal(nextUnit(sections, [], 11), 2)
  assert.equal(nextUnit(sections, [2], 11), 3)
  assert.equal(nextUnit(sections, [2, 3], 11), 0)
  assert.equal(nextUnit(sections, [0, 1, 2, 3], 11), -1)
  assert.equal(nextUnit(sections, [], 5), 1)
})
test('the first ready source section is usable before transcription finishes', () => {
  const sections = [{ start: 0, end: 5, text: 'Ready.', state: 'ready' }, { start: 5, end: 10, text: '', state: 'pending' }]
  assert.equal(nextUnit(sections, [], 0), 0)
  assert.equal(nextUnit(sections, [0], 0), -1)
  assert.equal(nextUnit([{ ...sections[0], state: 'error' }], [], 0), -1)
})
test('duration feedback includes the measured speech and a tighter text budget', () => {
  const guide = durationGuide(5, { text: 'A'.repeat(100), seconds: 10 })
  assert.match(guide, /10.0 seconds/)
  assert.match(guide, /at most 47 characters/)
})
test('severely overlong speech fails safely instead of truncating words', async () => {
  await assert.rejects(fitSpeech('/unused', 'test', Buffer.alloc(BYTES_PER_SECOND * 2), 1, new AbortController().signal), /too long/)
})
test('continuous tracks preserve offsets, duration and silence; overlaps fail', () => {
  const pcm = Buffer.alloc(BYTES_PER_SECOND / 2, 1)
  const output = assemblePcm([{ start: 0, end: 1, pcm }, { start: 1, end: 2, pcm }], 2)
  assert.equal(output.length, 2 * BYTES_PER_SECOND)
  assert.equal(output[BYTES_PER_SECOND], 1)
  assert.equal(output[BYTES_PER_SECOND - 1], 0)
  assert.throws(() => assemblePcm([{ start: 0, end: 0.1, pcm }], 2))
  assert.throws(() => assemblePcm([{ start: 0, end: 1, pcm }, { start: 0.5, end: 1, pcm }], 2))
  const file = wav(output)
  assert.equal(file.toString('ascii', 0, 4), 'RIFF')
  assert.equal(file.readUInt32LE(40), output.length)
})
test('edge silence trimming retains speech and handles all-silent input', () => {
  const pcm = Buffer.alloc(BYTES_PER_SECOND)
  pcm.writeInt16LE(1000, BYTES_PER_SECOND / 2)
  assert.ok(trimSilence(pcm).length < pcm.length)
  assert.ok(trimSilence(pcm).includes(Buffer.from([232, 3])))
  assert.equal(trimSilence(Buffer.alloc(100)).length, 0)
})
