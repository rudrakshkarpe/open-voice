import { useState } from 'react'
import { ArrowRight, Link, Play, Upload } from 'lucide-react'
import { RotatingHeadline } from './RotatingHeadline'

export function Welcome({ dragging, youtubeInput, setYoutubeInput, onYoutube, onUpload, onSample }: {
  dragging: boolean; youtubeInput: string; setYoutubeInput: (value: string) => void
  onYoutube: () => void; onUpload: () => void; onSample: () => Promise<void>
}) {
  const [loadingSample, setLoadingSample] = useState(false)
  return <section className={`welcome ${dragging ? 'dragging' : ''}`}>
    <div className="welcome-copy">
      <p className="eyebrow">A little less lost in translation</p>
      <RotatingHeadline />
      <p className="welcome-description">Bring a video. Choose a language.<br />Keep watching, with audio and captions together.</p>
      <button className="sample-button" disabled={loadingSample} onClick={async () => { setLoadingSample(true); try { await onSample() } finally { setLoadingSample(false) } }}><span><Play size={12} fill="currentColor" /></span>{loadingSample ? 'Opening the sample…' : 'Take it for a spin'}<ArrowRight size={14} /></button>
    </div>
    <div className="import-card">
      <h2>What are we watching?</h2>
      <p>A YouTube link or a file from your device.</p>
      <form className="youtube-form" onSubmit={(event) => { event.preventDefault(); onYoutube() }}>
        <label htmlFor="youtube-url">YouTube link</label>
        <div className="url-field"><Link size={17} aria-hidden="true" /><input id="youtube-url" type="url" placeholder="Paste a YouTube link" value={youtubeInput} onChange={(event) => setYoutubeInput(event.target.value)} aria-describedby="import-limits" required /></div>
        <button className="import-button" type="submit" disabled={!youtubeInput.trim()}>Open video<ArrowRight size={17} /></button>
      </form>
      <div className="or-divider"><span />or<span /></div>
      <button className="dropzone" onClick={onUpload}><Upload size={20} /><strong>{dragging ? 'Drop your file here' : 'Choose a video or audio file'}</strong><span>or drag it anywhere on this page</span></button>
      <p className="import-limits" id="import-limits">Up to 10 minutes · Files up to 200 MB</p>
      <small className="import-permission">Public YouTube videos or media you have permission to use.</small>
    </div>
  </section>
}
