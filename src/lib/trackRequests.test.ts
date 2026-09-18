import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldRefreshTrack } from './trackRequests'

test('playhead updates stop after a rejection or failed track instead of hammering limits', () => {
  assert.equal(shouldRefreshTrack('preparing', false, 3000, 2), true)
  for (const state of ['error', 'ready']) assert.equal(shouldRefreshTrack(state, false, 3000, 2), false)
  assert.equal(shouldRefreshTrack(undefined, true, 3000, 2), false)
  assert.equal(shouldRefreshTrack('preparing', false, 1000, 2), false)
  assert.equal(shouldRefreshTrack('preparing', false, 3000, 0), false)
})
