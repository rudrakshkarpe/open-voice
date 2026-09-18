import assert from 'node:assert/strict'
import test from 'node:test'
import { assemblePcm, durationGuide, fitSpeech, requiredTempo, speechWindow, translationUnits, trimSilence, wav } from './tracks.js'
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
test('short tails and sentence fragments are grouped without losing source timing', () => {
  assert.deepEqual(translationUnits([{ start: 0, end: 7, text: 'This sentence continues' }, { start: 7, end: 14, text: 'into the next section.' }, { start: 14, end: 15, text: 'Yes.' }]), [{ start: 0, end: 15, text: 'This sentence continues into the next section. Yes.' }])
})
test('grouping preserves silence and bounds TTS context', () => {
  const sections = [{ start: 0, end: 8, text: 'Hello.' }, { start: 8, end: 15, text: 'More speech.' }, { start: 15, end: 18, text: '' }, { start: 18, end: 25, text: 'Later.' }]
  assert.deepEqual(translationUnits(sections), [{ start: 0, end: 15, text: 'Hello. More speech.' }, ...sections.slice(2)])
  assert.equal(translationUnits([{ start: 0, end: 12, text: 'Long thought' }, { start: 12, end: 24, text: 'continued.' }]).length, 2)
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
