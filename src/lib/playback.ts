// Audio stays at natural 1x. Tiny video corrections avoid skipping spoken words.
export type TimedSection = { start: number; end: number; audioStart: number; audioEnd: number }
export function audioTimeAt(sections: TimedSection[], videoTime: number): number {
  const section = sections.find((item) => videoTime >= item.start && videoTime < item.end)
  if (section) return section.audioStart + (videoTime - section.start) / (section.end - section.start) * (section.audioEnd - section.audioStart)
  const last = sections.at(-1)
  return last && videoTime >= last.end ? last.audioEnd + videoTime - last.end : videoTime
}
export function videoTimeAt(sections: TimedSection[], audioTime: number): number {
  const section = sections.find((item) => audioTime >= item.audioStart && audioTime < item.audioEnd)
  if (section) return section.start + (audioTime - section.audioStart) / (section.audioEnd - section.audioStart) * (section.end - section.start)
  const last = sections.at(-1)
  return last && audioTime >= last.audioEnd ? last.end + audioTime - last.audioEnd : audioTime
}
export function videoRateAt(sections: TimedSection[], audioTime: number): number {
  const section = sections.find((item) => audioTime >= item.audioStart && audioTime < item.audioEnd)
  return section ? (section.end - section.start) / (section.audioEnd - section.audioStart) : 1
}
export function videoCorrection(audioPosition: number, videoPosition: number): number {
  const drift = audioPosition - videoPosition
  return Math.abs(drift) < 0.06 ? 1 : Math.max(0.98, Math.min(1.02, 1 + drift * 0.1))
}
export function switchBoundary(starts: number[], position: number): number {
  return starts.find((start) => start > position + 0.15 && start - position <= 1.5) ?? position
}
