// Admission is bounded separately by retained sessions. Waiting jobs consume no
// FFmpeg/downloader/provider work until a source-processing slot is available.
export class WorkQueue {
  private running = 0
  private pending: { work: () => Promise<void> }[] = []
  constructor(private concurrency: number) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new Error('Invalid queue concurrency.')
  }
  run<T>(signal: AbortSignal, work: () => Promise<T>) {
    return new Promise<T>((resolve, reject) => {
      const item = { work: async () => {
        signal.removeEventListener('abort', abort)
        try {
          if (signal.aborted) throw new Error('Cancelled')
          resolve(await work())
        } catch (error) { reject(error) }
      } }
      const abort = () => {
        const index = this.pending.indexOf(item)
        if (index >= 0) { this.pending.splice(index, 1); reject(new Error('Cancelled')) }
      }
      if (signal.aborted) { reject(new Error('Cancelled')); return }
      signal.addEventListener('abort', abort, { once: true })
      this.pending.push(item)
      this.drain()
    })
  }
  private drain() {
    while (this.running < this.concurrency && this.pending.length) {
      const item = this.pending.shift()!
      this.running++
      void item.work().finally(() => { this.running--; this.drain() })
    }
  }
}
