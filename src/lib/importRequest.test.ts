import assert from 'node:assert/strict'
import test from 'node:test'
import { requestImport, waitForSlot } from './importRequest'

const busy = () => Response.json({ code: 'SERVER_BUSY', retryAfter: 5 }, { status: 503 })
test('the default fetch keeps its browser Window receiver', async (context) => {
  context.mock.method(globalThis, 'fetch', function (this: unknown) {
    assert.equal(this, globalThis)
    return Promise.resolve(Response.json({ id: 'browser-job' }, { status: 202 }))
  })
  const result = await requestImport('/api/media/youtube', {}, new AbortController().signal, () => {})
  assert.equal(result.id, 'browser-job')
})
test('a full demo waits and starts automatically once capacity is available', async () => {
  let requests = 0
  const messages: string[] = []
  const delays: number[] = []
  const result = await requestImport('/api/media/youtube', {}, new AbortController().signal, (message) => messages.push(message), {
    fetch: async () => ++requests === 1 ? busy() : Response.json({ id: 'job' }, { status: 202 }),
    wait: async (ms) => { delays.push(ms) },
  })
  assert.equal(result.id, 'job'); assert.equal(requests, 2)
  assert.deepEqual(delays, [5000]); assert.match(messages[0], /automatically/)
})
test('busy retries are bounded and other failures are not retried', async () => {
  let requests = 0
  await assert.rejects(requestImport('/api/media/youtube', {}, new AbortController().signal, () => {}, {
    fetch: async () => { requests++; return busy() }, wait: async () => {},
  }), /still at capacity/)
  assert.equal(requests, 10)
  for (const response of [Response.json({ error: 'Daily limit' }, { status: 429 }), new Response('<html>gateway down</html>', { status: 502 })]) {
    requests = 0
    await assert.rejects(requestImport('/api/media/youtube', {}, new AbortController().signal, () => {}, {
      fetch: async () => { requests++; return response }, wait: async () => { assert.fail('must not retry') },
    }))
    assert.equal(requests, 1)
  }
})
test('leaving an import cancels its capacity wait immediately', async () => {
  const controller = new AbortController()
  const pending = waitForSlot(60000, controller.signal)
  controller.abort()
  await assert.rejects(pending, /Cancelled/)
  await assert.rejects(waitForSlot(60000, controller.signal), /Cancelled/)
})
