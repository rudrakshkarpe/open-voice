export function waitForSlot(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new Error('Cancelled')); return }
    const abort = () => { clearTimeout(timer); reject(new Error('Cancelled')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}

// Only retry an explicit pre-admission rejection. A network timeout might have
// already created a job, so automatically replaying it could duplicate work.
export async function requestImport(url: string, init: RequestInit, signal: AbortSignal, status: (message: string) => void,
  dependencies = { fetch: globalThis.fetch.bind(globalThis), wait: waitForSlot }) {
  for (let attempt = 0; ; attempt++) {
    const response = await dependencies.fetch(url, { ...init, signal })
    const body = await response.json().catch(() => ({}))
    if (response.ok) return body
    if (response.status === 503 && body.code === 'SERVER_BUSY' && attempt < 9) {
      status('Waiting for a free slot… We’ll start automatically.')
      const seconds = Math.min(5, Math.max(1, Number(body.retryAfter) || 5))
      await dependencies.wait(seconds * 1000, signal)
      continue
    }
    throw new Error(body.code === 'SERVER_BUSY' ? 'The demo is still at capacity. Try this link again shortly, or close an unused video session.' : body.error ?? `The server could not accept this import (${response.status}). Try again shortly.`)
  }
}
