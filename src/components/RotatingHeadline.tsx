import { useEffect, useState } from 'react'
import { Pause, Play } from 'lucide-react'

const phrases = [
  { lang: 'en', text: 'in your language.' },
  { lang: 'it', text: 'nella tua lingua.' },
  { lang: 'es', text: 'en tu idioma.' },
  { lang: 'zh', text: '用你的语言。' },
  { lang: 'fr', text: 'dans votre langue.' },
]

export function RotatingHeadline() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(preference.matches)
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (paused || reducedMotion) return
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % phrases.length), 3600)
    return () => window.clearInterval(timer)
  }, [paused, reducedMotion])

  return <div className="headline-wrap">
    <h1><span className="sr-only">Every video, in your language.</span><span aria-hidden="true">Every video,<span className="rotating-line">{phrases.map((phrase, position) => <span lang={phrase.lang} key={phrase.lang} className={(reducedMotion ? 0 : index) === position ? 'visible' : ''}>{phrase.text}</span>)}</span></span></h1>
    {!reducedMotion && <button className="motion-control" aria-label={paused ? 'Resume headline animation' : 'Pause headline animation'} onClick={() => setPaused((value) => !value)}>{paused ? <Play size={12} /> : <Pause size={12} />}</button>}
  </div>
}
