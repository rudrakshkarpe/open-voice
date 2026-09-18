/// <reference types="node" />
import assert from 'node:assert/strict'
import test from 'node:test'
import { audioTimeAt, switchBoundary, videoCorrection, videoRateAt, videoTimeAt } from './playback'

const sections = [{ start: 0, end: 10, audioStart: 0, audioEnd: 10 }, { start: 10, end: 20, audioStart: 10, audioEnd: 25 }, { start: 20, end: 30, audioStart: 25, audioEnd: 35 }]
test('voice-paced sections map both clocks continuously, including seek and trailing silence', () => {
  for (const position of [0, 5, 10, 15, 20, 25, 30, 30.02]) {
    assert.ok(Math.abs(videoTimeAt(sections, audioTimeAt(sections, position)) - position) < 0.00001)
  }
  assert.equal(audioTimeAt(sections, 15), 17.5)
  assert.equal(videoTimeAt(sections, 17.5), 15)
  assert.equal(videoRateAt(sections, 12), 2 / 3)
  assert.equal(videoRateAt(sections, 25), 1)
  assert.equal(audioTimeAt([], 5), 5)
})

test('clock correction is gentle and leaves small drift untouched', () => {
  assert.equal(videoCorrection(3.03, 3), 1)
  assert.equal(videoCorrection(10, 3), 1.02)
  assert.equal(videoCorrection(0, 3), 0.98)
})
test('prepared language switches use a nearby boundary but never wait a whole long section', () => {
  assert.equal(switchBoundary([0, 7, 14], 6), 7)
  assert.equal(switchBoundary([0, 7, 14], 7), 7)
  assert.equal(switchBoundary([0, 7, 14], 4), 4)
  assert.equal(switchBoundary([0, 7, 14], 18), 18)
})
