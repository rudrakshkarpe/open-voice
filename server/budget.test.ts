import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DailyBudget } from './budget.js'

test('provider work stops at the shared daily demo limit', () => {
  const budget = new DailyBudget(2)
  budget.take(); budget.take()
  assert.throws(() => budget.take(), /daily speech limit/)
})
test('budget resets at the next UTC day, not after each request', () => {
  let now = new Date('2026-09-18T23:59:59Z')
  const budget = new DailyBudget(1, () => now)
  budget.take(); assert.throws(() => budget.take())
  now = new Date('2026-09-19T00:00:00Z')
  budget.take(); assert.throws(() => budget.take())
})
