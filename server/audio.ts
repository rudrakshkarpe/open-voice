export const SAMPLE_RATE = 24000
export const BYTES_PER_SECOND = SAMPLE_RATE * 2

export function signalStats(pcm: Buffer) {
  let sum = 0
  let peak = 0
  const count = Math.floor(pcm.length / 2)
  for (let i = 0; i < count; i++) {
    const sample = pcm.readInt16LE(i * 2) / 32768
    sum += sample * sample
    peak = Math.max(peak, Math.abs(sample))
  }
  return { rmsDb: 20 * Math.log10(Math.max(1e-9, Math.sqrt(sum / Math.max(1, count)))), peakDb: 20 * Math.log10(Math.max(1e-9, peak)) }
}

// Prefer a quiet boundary between 4 and 9 seconds; never discard or duplicate samples.
export function segmentAudio(pcm: Buffer) {
  const segments: { index: number; start: number; end: number; rmsDb: number }[] = []
  const duration = pcm.length / BYTES_PER_SECOND
  let start = 0
  while (start < duration) {
    let end = Math.min(start + 8, duration)
    if (duration - start > 9) {
      let quietest = Infinity
      for (let time = start + 4; time <= Math.min(start + 9, duration); time += 0.1) {
        const offset = Math.floor(time * SAMPLE_RATE) * 2
        const energy = signalStats(pcm.subarray(offset, offset + BYTES_PER_SECOND / 10)).rmsDb
        if (energy < quietest) { quietest = energy; end = Math.round(time * 10) / 10 }
      }
    } else end = duration
    const chunk = pcm.subarray(Math.round(start * SAMPLE_RATE) * 2, Math.round(end * SAMPLE_RATE) * 2)
    segments.push({ index: segments.length, start, end, rmsDb: signalStats(chunk).rmsDb })
    start = end
  }
  return segments
}
