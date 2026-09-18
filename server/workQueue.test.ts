import assert from 'node:assert/strict'
import test from 'node:test'
import { WorkQueue } from './workQueue.js'

test('busy source jobs queue instead of rejecting a valid import', async () => {
  const queue = new WorkQueue(2)
  const signal = new AbortController().signal
  const started: number[] = []
  let release!: () => void
  const hold = new Promise<void>((resolve) => { release = resolve })
  const first = queue.run(signal, async () => { started.push(1); await hold; return 'one' })
  const second = queue.run(signal, async () => { started.push(2); await hold })
  const third = queue.run(signal, async () => { started.push(3) })
  assert.deepEqual(started, [1, 2])
  release()
  assert.equal(await first, 'one')
  await Promise.all([second, third])
  assert.deepEqual(started, [1, 2, 3])
})

test('cancelled queued jobs never start and errors release the next slot', async () => {
  const queue = new WorkQueue(1)
  const controller = new AbortController()
  let release!: () => void
  const first = queue.run(controller.signal, () => new Promise<void>((resolve) => { release = resolve }))
  const cancelled = new AbortController()
  let ran = false
  const waiting = queue.run(cancelled.signal, async () => { ran = true })
  const rejection = assert.rejects(waiting, /Cancelled/)
  cancelled.abort(); await rejection
  release(); await first
  await assert.rejects(queue.run(controller.signal, async () => { throw new Error('failed') }), /failed/)
  assert.equal(await queue.run(controller.signal, async () => 42), 42)
  assert.equal(ran, false)
})
