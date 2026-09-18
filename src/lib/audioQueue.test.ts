/// <reference types="node" />
import assert from 'node:assert/strict'
import test from 'node:test'
import { AudioQueue, bufferedAhead, canStartStream } from './audioQueue'
import type { AudioChunk } from './audioQueue'

const chunk = (index: number, duration = 5): AudioChunk => ({ index, start: index * 5, end: (index + 1) * 5, audioStart: 0, audioEnd: duration, audioUrl: `/chunk-${index}.wav` })
const audio = (duration: number) => ({ duration }) as AudioBuffer
function fakeContext() {
  const starts: { at: number; offset: number }[] = []
  const stops: number[] = []
  const raw = { currentTime: 100, destination: {},
    createBufferSource: () => ({ buffer: null, onended: null, connect() {}, disconnect() {}, start(at: number, offset: number) { starts.push({ at, offset }) }, stop(at: number) { stops.push(at) } }),
    createGain: () => ({ gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {}, disconnect() {} }),
  }
  return { raw, starts, stops, context: raw as unknown as AudioContext }
}

test('one buffered section starts playback without waiting for the whole track', () => {
  assert.equal(canStartStream([chunk(0)], 0, 60, () => true), true)
  assert.equal(canStartStream([chunk(0)], 4.5, 60, () => true), false)
  assert.equal(canStartStream([chunk(0)], 4.5, 5, () => true), true)
  assert.equal(canStartStream([chunk(0)], 0, 60, () => false), false)
  assert.equal(canStartStream([chunk(0)], 15, 60, () => true), false)
})
test('buffer accounting stops at a missing section, not the final generated section', () => {
  assert.equal(bufferedAhead([chunk(0), chunk(2)], 2, () => true), 3)
  assert.equal(bufferedAhead([chunk(0), chunk(1, 7.5)], 2, () => true), 10.5)
  assert.equal(bufferedAhead([chunk(0), chunk(1)], 2, (item) => item.index === 0), 3)
})
test('sections are scheduled back-to-back before onended, with a continuous source clock', () => {
  const fake = fakeContext(); const queue = new AudioQueue(fake.context)
  assert.equal(queue.append(chunk(0), audio(5)), true)
  assert.equal(queue.append(chunk(1, 7.5), audio(7.5)), true)
  assert.deepEqual(fake.starts, [{ at: 100.03, offset: 0 }, { at: 105.03, offset: 0 }])
  fake.raw.currentTime = 106.53
  assert.ok(Math.abs(queue.clock()!.position - 6) < 0.00001)
  assert.equal(queue.clock()!.rate, 2 / 3)
  assert.equal(queue.exhausted, false)
  fake.raw.currentTime = 113
  assert.equal(queue.exhausted, true)
})
test('seeking starts at the mapped audio offset and stopping cancels future sections', () => {
  const fake = fakeContext(); const queue = new AudioQueue(fake.context)
  queue.append(chunk(1, 7.5), audio(7.5), 7)
  queue.append(chunk(2), audio(5))
  assert.equal(fake.starts[0].offset, 3)
  assert.ok(Math.abs(fake.starts[1].at - 104.53) < 0.00001)
  queue.stop()
  assert.equal(fake.stops.length, 2)
  assert.equal(queue.tail, undefined)
})
test('the queue rejects gaps and late appends instead of silently skipping audio', () => {
  const fake = fakeContext(); const queue = new AudioQueue(fake.context)
  queue.append(chunk(0), audio(5))
  assert.equal(queue.append(chunk(2), audio(5)), false)
  fake.raw.currentTime = 106
  assert.equal(queue.append(chunk(1), audio(5)), false)
  assert.equal(fake.starts.length, 1)
})
