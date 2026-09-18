import { audioTimeAt, videoTimeAt } from './playback'

export type AudioChunk = { index: number; start: number; end: number; audioStart: number; audioEnd: number; audioUrl: string }
export const chunkAt = <T extends AudioChunk>(chunks: T[], position: number) => chunks.find((chunk) => position >= chunk.start && position < chunk.end)

export function bufferedAhead(chunks: AudioChunk[], position: number, available: (chunk: AudioChunk) => boolean): number {
  let chunk = chunkAt(chunks, position)
  let seconds = 0
  while (chunk && available(chunk)) {
    seconds += chunk.audioEnd - audioTimeAt([chunk], position)
    position = chunk.end
    chunk = chunks.find((item) => item.index === chunk!.index + 1 && Math.abs(item.start - position) < 0.002)
  }
  return seconds
}

export function canStartStream(chunks: AudioChunk[], position: number, duration: number, available: (chunk: AudioChunk) => boolean): boolean {
  const chunk = chunkAt(chunks, position)
  if (!chunk || !available(chunk)) return false
  // One short cushion, not the whole track. A final short tail is playable too.
  return bufferedAhead(chunks, position, available) >= 2 || (chunk.end >= duration - 0.05)
}

type Scheduled = { chunk: AudioChunk; start: number; end: number; offset: number; source: AudioBufferSourceNode; gain: GainNode }

/** Schedule decoded PCM on the audio clock, never from onended or a UI timer. */
export class AudioQueue {
  private nodes: Scheduled[] = []
  constructor(private context: AudioContext) {}
  get tail() { return this.nodes.at(-1) }
  get ahead() { return Math.max(0, (this.tail?.end ?? 0) - this.context.currentTime) }
  get exhausted() { return Boolean(this.tail && this.context.currentTime >= this.tail.end) }

  append(chunk: AudioChunk, buffer: AudioBuffer, position = chunk.start): boolean {
    const previous = this.tail
    if (previous && (chunk.index !== previous.chunk.index + 1 || Math.abs(chunk.start - previous.chunk.end) > 0.002 || previous.end <= this.context.currentTime)) return false
    const offset = previous ? 0 : audioTimeAt([chunk], position)
    if (offset >= buffer.duration) return false
    const start = previous?.end ?? this.context.currentTime + 0.03
    const end = start + buffer.duration - offset
    const source = this.context.createBufferSource(); const gain = this.context.createGain()
    source.buffer = buffer; source.connect(gain); gain.connect(this.context.destination)
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(1, start + Math.min(0.005, (end - start) / 3))
    gain.gain.setValueAtTime(1, Math.max(start, end - 0.005))
    gain.gain.linearRampToValueAtTime(0, end)
    source.start(start, offset)
    source.onended = () => { source.disconnect(); gain.disconnect() }
    this.nodes = this.nodes.filter((node) => node.end > this.context.currentTime)
    this.nodes.push({ chunk, source, gain, start, end, offset })
    return true
  }

  clock() {
    const now = this.context.currentTime
    const node = this.nodes.find((item) => now < item.end)
    if (!node) return null
    const audioTime = node.offset + Math.max(0, now - node.start)
    return { position: videoTimeAt([node.chunk], audioTime), rate: (node.chunk.end - node.chunk.start) / node.chunk.audioEnd }
  }

  stop() {
    const now = this.context.currentTime
    for (const node of this.nodes) {
      node.gain.gain.cancelScheduledValues(now)
      node.gain.gain.setValueAtTime(node.start > now ? 0 : node.gain.gain.value, now)
      node.gain.gain.linearRampToValueAtTime(0, now + 0.015)
      node.source.stop(now + 0.02)
    }
    this.nodes = []
  }
}
