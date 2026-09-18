import assert from 'node:assert/strict'
import test from 'node:test'
import { IDLE_SESSION_MS, sessionExpired } from './sessionPolicy.js'

test('disconnected sessions release capacity after reconnect grace; connected sessions survive', () => {
  assert.equal(sessionExpired(0, 0, IDLE_SESSION_MS - 1), false)
  assert.equal(sessionExpired(0, 0, IDLE_SESSION_MS), true)
  assert.equal(sessionExpired(0, 1, IDLE_SESSION_MS * 100), false)
  assert.equal(sessionExpired(IDLE_SESSION_MS, 0, IDLE_SESSION_MS + 1), false)
})
