export const bosonVoices = [
  { id: 'chloe', name: 'Chloe', detail: 'Friendly · engaging' },
  { id: 'eleanor', name: 'Eleanor', detail: 'Calm · educational' },
  { id: 'jake', name: 'Jake', detail: 'Energetic · dramatic' },
  { id: 'marcus', name: 'Marcus', detail: 'Confident · professorial' },
  { id: 'nora', name: 'Nora', detail: 'Soft · narrative' },
  { id: 'oliver', name: 'Oliver', detail: 'Thoughtful · reflective' },
]

export const languageOptions = [
  { code: '', name: 'Auto-detect · 102 languages' },
  { code: 'en', name: 'English' }, { code: 'hi', name: 'Hindi' },
  { code: 'es', name: 'Spanish' }, { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' }, { code: 'pt', name: 'Portuguese' },
  { code: 'ja', name: 'Japanese' }, { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' }, { code: 'ar', name: 'Arabic' },
  { code: 'ru', name: 'Russian' }, { code: 'it', name: 'Italian' },
  { code: 'sv', name: 'Swedish' }, { code: 'th', name: 'Thai' },
  { code: 'vi', name: 'Vietnamese' }, { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' }, { code: 'mr', name: 'Marathi' },
  { code: 'bn', name: 'Bengali' }, { code: 'gu', name: 'Gujarati' },
  { code: 'kn', name: 'Kannada' }, { code: 'ml', name: 'Malayalam' },
  { code: 'ur', name: 'Urdu' }, { code: 'id', name: 'Indonesian' },
  { code: 'tr', name: 'Turkish' }, { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' }, { code: 'uk', name: 'Ukrainian' },
]

export const deliveryOptions = [
  { id: '', name: 'Natural' },
  { id: 'emotion:enthusiasm', name: 'Enthusiastic' },
  { id: 'emotion:contentment', name: 'Calm' },
  { id: 'emotion:contemplation', name: 'Reflective' },
  { id: 'emotion:surprise', name: 'Surprised' },
  { id: 'style:whispering', name: 'Whisper' },
  { id: 'style:shouting', name: 'Projected' },
  { id: 'prosody:expressive_high', name: 'Expressive' },
]

export async function generateSpeech(options: { text: string; voice: string; language: string; delivery: string }) {
  const taggedInput = options.delivery ? `<|${options.delivery}|>${options.text}` : options.text
  const response = await fetch('/api/boson/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: taggedInput, voice: options.voice, tn_language: options.language || undefined }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null
    throw new Error(payload?.error?.message ?? 'Higgs could not generate this voice.')
  }
  return URL.createObjectURL(await response.blob())
}
