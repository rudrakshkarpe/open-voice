export type CaptionCue = { start: number; end: number; text: string }

// STT supplies section boundaries, not word timestamps. Distribute short phrases
// within those boundaries; these are estimated reading cues, not forced alignment.
export function captionCues(text: string, start: number, end: number): CaptionCue[] {
  if (!text.trim() || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return []
  const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const size = (value: string) => Array.from(graphemes.segment(value)).length
  const tokens = Array.from(new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text), (part) => part.segment)
    .flatMap((token) => size(token) > 36 ? Array.from(graphemes.segment(token), (part) => part.segment) : [token])
  const phrases: string[] = []
  let phrase = ''; let words = 0
  const flush = () => { if (phrase.trim()) phrases.push(phrase.trim()); phrase = ''; words = 0 }
  for (const token of tokens) {
    const isWord = /[\p{L}\p{N}\p{S}]/u.test(token)
    if (isWord && (size(phrase + token) > 36 || words >= 6)) flush()
    phrase += token
    if (isWord) words++
    if (/[.!?。！？،,;；:]$/u.test(token) && words >= 3) flush()
  }
  flush()
  const weights = phrases.map((value) => Math.max(1, size(value.replace(/\s/g, ''))))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let elapsed = 0
  return phrases.map((value, index) => {
    const from = start + (end - start) * elapsed / total
    elapsed += weights[index]
    return { text: value, start: from, end: index === phrases.length - 1 ? end : start + (end - start) * elapsed / total }
  })
}

export function captionAt(cues: CaptionCue[], time: number): string {
  // Never reveal the opening paragraph on upload or after rewinding to zero.
  if (!Number.isFinite(time) || time <= 0) return ''
  return cues.find((cue) => time >= cue.start && time < cue.end)?.text ?? ''
}
