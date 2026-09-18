import { useEffect, useRef, useState } from 'react'
import { AudioLines, CircleAlert, Globe2, LoaderCircle, Play, Sparkles } from 'lucide-react'
import { bosonVoices, deliveryOptions, generateSpeech, languageOptions } from '../lib/boson'

export function HiggsStudio() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [text, setText] = useState('Your story can speak in any voice, in any language, from a single creative canvas.')
  const [voice, setVoice] = useState('chloe')
  const [language, setLanguage] = useState('')
  const [delivery, setDelivery] = useState('emotion:enthusiasm')
  const [outputUrl, setOutputUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [healthy, setHealthy] = useState<boolean | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/boson/status')
      .then((response) => response.json())
      .then((status: { healthy?: boolean }) => setHealthy(Boolean(status.healthy)))
      .catch(() => setHealthy(false))
  }, [])

  const generate = async () => {
    if (!text.trim() || loading) return
    setLoading(true)
    setError('')
    try {
      const nextOutput = await generateSpeech({ text, voice, language, delivery })
      if (outputUrl) URL.revokeObjectURL(outputUrl)
      setOutputUrl(nextOutput)
      window.setTimeout(() => audioRef.current?.play(), 0)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Voice generation failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="higgs-studio">
      <div className="higgs-status">
        <span className="higgs-mark">B</span>
        <div><small>HIGGS TTS 3</small><strong>Generative voice</strong></div>
        <i className={healthy ? 'online' : ''} />
        <b>{healthy === null ? 'CHECKING' : healthy ? 'CONNECTED' : 'OFFLINE'}</b>
      </div>

      <label className="script-field">
        <span>VOICE SCRIPT <b>{text.length} / 5000</b></span>
        <textarea value={text} maxLength={5000} onChange={(event) => setText(event.target.value)} placeholder="Type or paste a transcript in any supported language…" />
      </label>

      <div className="higgs-select-grid">
        <label><span><Globe2 size={12} /> LANGUAGE</span><select value={language} onChange={(event) => setLanguage(event.target.value)}>{languageOptions.map((option) => <option value={option.code} key={option.code || 'auto'}>{option.name}</option>)}</select></label>
        <label><span><AudioLines size={12} /> VOICE</span><select value={voice} onChange={(event) => setVoice(event.target.value)}>{bosonVoices.map((option) => <option value={option.id} key={option.id}>{option.name} · {option.detail}</option>)}</select></label>
      </div>

      <div className="delivery-field">
        <span>DELIVERY</span>
        <div>{deliveryOptions.map((option) => <button className={delivery === option.id ? 'active' : ''} key={option.name} onClick={() => setDelivery(option.id)}>{option.name}</button>)}</div>
      </div>

      {error && <div className="higgs-error"><CircleAlert size={14} /> {error}</div>}

      <button className="generate-button" onClick={generate} disabled={loading || !text.trim()}>
        {loading ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}
        {loading ? 'Generating with Higgs…' : 'Generate voice preview'}
      </button>

      <div className={`generated-player ${outputUrl ? 'visible' : ''}`}>
        <button onClick={() => audioRef.current?.play()}><Play size={14} fill="currentColor" /></button>
        <div><strong>Higgs output ready</strong><small>{language ? language.toUpperCase() : 'AUTO'} · {bosonVoices.find((item) => item.id === voice)?.name}</small></div>
        <audio ref={audioRef} src={outputUrl} controls />
      </div>

      <p className="language-footnote"><Globe2 size={12} /> Auto-detect covers all 102 supported languages. Set a language for short or mixed-language scripts.</p>
    </div>
  )
}
