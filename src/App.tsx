import { useRef, useState } from 'react'
import { ArrowRight, Check, ChevronDown, Languages, LoaderCircle, Pause, Play, RotateCcw, Sparkles, Upload, Video } from 'lucide-react'
import { useRealtimeInterpreter } from './hooks/useRealtimeInterpreter'
import { targetLanguages } from './lib/languages'

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [targetCode, setTargetCode] = useState('es')
  const [playing, setPlaying] = useState(false)
  const [dragging, setDragging] = useState(false)
  const target = targetLanguages.find((language) => language.code === targetCode) ?? targetLanguages[0]
  const interpreter = useRealtimeInterpreter(target.name)

  const loadFile = async (file?: File) => {
    if (!file || (!file.type.startsWith('video/') && !file.type.startsWith('audio/'))) return
    await interpreter.stop()
    if (sourceUrl.startsWith('blob:')) URL.revokeObjectURL(sourceUrl)
    setSourceUrl(URL.createObjectURL(file))
    setSourceName(file.name)
    setPlaying(false)
  }

  const loadSample = async () => {
    await interpreter.stop()
    setSourceUrl('/media/demo-source.mp4')
    setSourceName('youtube-demo.mp4')
    setPlaying(false)
  }

  const togglePlayback = async () => {
    const video = videoRef.current
    if (!video) return
    if (!video.paused) {
      video.pause()
      return
    }
    if (interpreter.status === 'idle' || interpreter.status === 'error') await interpreter.start(video)
    await video.play()
  }

  const reset = async () => {
    const video = videoRef.current
    if (video) {
      video.pause()
      video.currentTime = 0
      video.volume = 1
    }
    await interpreter.stop()
    setPlaying(false)
  }

  const changeLanguage = (code: string) => {
    const next = targetLanguages.find((language) => language.code === code)
    if (!next) return
    setTargetCode(code)
    interpreter.changeTarget(next.name)
  }

  const working = interpreter.status === 'connecting'
  const live = interpreter.status === 'listening' || interpreter.status === 'speaking'

  return (
    <div className="shell">
      <header>
        <a className="logo" href="/"><span><Languages size={18} /></span>openvoice</a>
        <div className={`status ${live ? 'live' : ''}`}><i />{working ? 'Connecting' : live ? 'Translating live' : 'Ready'}</div>
      </header>

      <main className={sourceUrl ? 'has-source' : ''}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false) }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); void loadFile(event.dataTransfer.files[0]) }}>
        {!sourceUrl ? (
          <section className={`welcome ${dragging ? 'dragging' : ''}`}>
            <div className="welcome-copy">
              <p>REALTIME VIDEO TRANSLATION</p>
              <h1>Every video,<br />in your language.</h1>
              <span>Upload a video. We detect the spoken language and translate its voice and captions while it plays.</span>
            </div>
            <button className="dropzone" onClick={() => fileRef.current?.click()}>
              <span><Upload size={23} /></span>
              <strong>{dragging ? 'Drop it here' : 'Upload a video'}</strong>
              <small>MP4, MOV, WebM, MP3 or WAV</small>
            </button>
            <button className="sample-button" onClick={loadSample}><Play size={12} fill="currentColor" /> Try the sample video</button>
          </section>
        ) : (
          <div className="workspace">
            <section className="player-column">
              <div className="source-bar">
                <div><Video size={14} /><span>{sourceName}</span></div>
                <button onClick={() => fileRef.current?.click()}><Upload size={13} /> Replace</button>
              </div>
              <div className="video-frame">
                <video ref={videoRef} src={sourceUrl} playsInline
                  onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); void interpreter.stop() }} />
                {(interpreter.translatedCaption || interpreter.sourceCaption) && (
                  <div className="captions">
                    {interpreter.translatedCaption && <strong>{interpreter.translatedCaption}</strong>}
                    {interpreter.sourceCaption && <small>{interpreter.sourceCaption}</small>}
                  </div>
                )}
                {!playing && <button className="play" onClick={togglePlayback} disabled={working}>{working ? <LoaderCircle className="spin" size={24} /> : <Play size={26} fill="currentColor" />}</button>}
              </div>
              <div className="controls">
                <button onClick={reset}><RotateCcw size={16} /></button>
                <button className="primary-control" onClick={togglePlayback} disabled={working}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button>
                <div className="control-line"><span className={live ? 'moving' : ''} /></div>
                <span>{interpreter.status === 'speaking' ? 'Speaking translation' : live ? 'Listening' : working ? 'Starting…' : 'Paused'}</span>
              </div>
              {interpreter.error && <p className="error">{interpreter.error}</p>}
            </section>

            <aside>
              <div className="aside-head"><p>TRANSLATION</p><span><Sparkles size={13} /> Higgs Realtime</span></div>

              <section className="detected">
                <small>DETECTED LANGUAGE</small>
                <div><span>{interpreter.detectedLanguage}</span>{interpreter.detectedLanguage !== 'Detecting…' && <Check size={15} />}</div>
                <p>{interpreter.sourceCaption || 'Play the video to identify its spoken language.'}</p>
              </section>

              <div className="flow-arrow"><span /><ArrowRight size={15} /><span /></div>

              <label className="language-select">
                <small>TRANSLATE TO</small>
                <div><Languages size={18} /><select value={targetCode} onChange={(event) => changeLanguage(event.target.value)}>{targetLanguages.map((language) => <option key={language.code} value={language.code}>{language.name}</option>)}</select><ChevronDown size={15} /></div>
              </label>

              <section className="output-card">
                <small>LIVE OUTPUT</small>
                <p>{interpreter.translatedCaption || `Translated ${target.name} captions appear here as the new voice plays.`}</p>
                <div className={live ? 'active' : ''}><i /><span>{live ? 'Realtime stream active' : 'Waiting for playback'}</span></div>
              </section>

              <p className="privacy">Audio streams directly to Boson using a short-lived session key. Your API key stays on the server.</p>
            </aside>
          </div>
        )}
        <input ref={fileRef} hidden type="file" accept="video/*,audio/*" onChange={(event) => void loadFile(event.target.files?.[0])} />
      </main>
    </div>
  )
}
