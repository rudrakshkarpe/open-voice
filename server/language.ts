import { francAll } from 'franc-min'

const names = new Intl.DisplayNames(['en'], { type: 'language' })
export function detectLanguage(text: string): string | null {
  if ((text.match(/\p{L}/gu) ?? []).length < 60) return null
  const ranked = francAll(text)
  if (ranked[0]?.[0] === 'und' || !ranked[1] || ranked[0][1] - ranked[1][1] < 0.08) return null
  return names.of(ranked[0][0]) ?? null
}
