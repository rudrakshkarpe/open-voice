import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Languages, Pause, Play, RotateCcw, Upload, Video, Headphones, Volume2 } from 'lucide-react'
import { useMediaSession } from './hooks/useMediaSession'
import { useDubPlayer } from './hooks/useDubPlayer'
import { targetLanguages } from './lib/languages'
import { captionAt, captionCues } from './lib/captions'

const clock = (time: number) => `${Math.floor(time / 60)}:${Math.floor(time % 60).toString().padStart(2, '0')}`

export default function App() {
  const fileRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLAudioElement>(null)
  const [source, setSource] = useState({ url: '', name: '', audioOnly: false })
  const [targetCode, setTargetCode] = useState('original')
  const [dragging, setDragging] = useState(false)
  const [duration, setDuration] = useState(0)
  const [fileError, setFileError] = useState('')
  const [ratio, setRatio] = useState(16 / 9)
  const session = useMediaSession()
  const player = useDubPlayer(session.job, targetCode)
  const { videoRef, audioRef } = player
  const sourceRef = useRef('')
  const loadRevision = useRef(0)
  const segment = session.job?.segments.find((item) => player.time >= item.start && player.time < item.end)
  const dub = segment && session.job?.dubs[`${segment.index}-${targetCode}`]
  const captionText = targetCode === 'original' ? segment?.text : dub?.state === 'ready' ? dub.text : ''
  const cues = useMemo(() => captionCues(captionText ?? '', segment?.start ?? 0, segment?.end ?? 0), [captionText, segment?.start, segment?.end])
  const caption = captionAt(cues, player.time)
  const targetName = targetLanguages.find((language) => language.code === targetCode)?.name
  const completed = session.job?.segments.filter((item) => item.state === 'ready').length ?? 0
  const total = session.job?.segments.length ?? 0
  const error = fileError || player.error || session.error || session.job?.error
  const preparing = session.uploading || session.job?.status === 'extracting' || session.job?.status === 'transcribing'

  useEffect(() => () => { if (sourceRef.current.startsWith('blob:')) URL.revokeObjectURL(sourceRef.current) }, [])

  const loadFile = async (file?: File) => {
    if (!file) return
    if (file.size > 200 * 1024 * 1024) { setFileError('Use a file smaller than 200 MB.'); return }
    if (!/^(video|audio)\//.test(file.type) && !/\.(mp4|mov|webm|mp3|wav|m4a|ogg|flac)$/i.test(file.name)) { setFileError('Choose an audio or video file.'); return }
    loadRevision.current++; player.reset(); previewRef.current?.pause(); setFileError(''); setTargetCode('original'); setDuration(0); setRatio(16 / 9)
    if (sourceRef.current.startsWith('blob:')) URL.revokeObjectURL(sourceRef.current)
    const url = URL.createObjectURL(file); sourceRef.current = url
    setSource({ url, name: file.name, audioOnly: file.type.startsWith('audio/') })
    await session.upload(file)
  }
  const loadSample = async () => {
    const revision = ++loadRevision.current
    try {
      const response = await fetch('/media/demo-source.mp4')
      if (!response.ok) throw new Error('Sample could not be loaded.')
      const blob = await response.blob()
      if (revision === loadRevision.current) await loadFile(new File([blob], 'youtube-demo.mp4', { type: 'video/mp4' }))
    } catch { setFileError('Sample could not be loaded.') }
  }

  return <div className="shell">
    <header>
      <a className="logo" href="/"><span><Languages size={18} /></span>openvoice</a>
      <div className={`status ${player.playing ? 'live' : ''}`}><i />{player.playing ? player.state : preparing ? 'Preparing captions' : source.url ? 'Paused' : 'Ready'}</div>
    </header>
    <main className={source.url ? 'has-source' : ''} onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void loadFile(event.dataTransfer.files[0]) }}>
      {!source.url ? <section className={`welcome ${dragging ? 'dragging' : ''}`}>
        <div className="welcome-copy"><p>VIDEO TRANSLATION</p><h1>Every video,<br />in your language.</h1><span>Upload a clip. We identify the speech, prepare captions, and translate its voice as you watch.</span></div>
        <button className="dropzone" onClick={() => fileRef.current?.click()}><span><Upload size={23} /></span><strong>{dragging ? 'Drop it here' : 'Upload a video'}</strong><small>Audio or video · up to 200 MB / 10 minutes</small></button>
        <button className="sample-button" onClick={() => void loadSample()}><Play size={12} fill="currentColor" /> Try the sample video</button>
      </section> : <div className="workspace">
        <section className="player-column">
          <div className="source-bar"><div><Video size={14} /><span>{source.name}</span></div><button onClick={() => fileRef.current?.click()}><Upload size={13} /> Replace</button></div>
          <div className="video-frame" style={{ aspectRatio: String(source.audioOnly ? 16 / 9 : ratio), maxWidth: `${(source.audioOnly ? 16 / 9 : ratio) * 65}vh` }}>
            <video ref={videoRef} src={source.url} playsInline preload="auto" onLoadedMetadata={(event) => {
              const media = event.currentTarget; setDuration(Number.isFinite(media.duration) ? media.duration : 0)
              if (media.videoWidth && media.videoHeight) setRatio(media.videoWidth / media.videoHeight)
            }} onError={() => { player.pause(); setFileError('This browser cannot play this file. Try an H.264 MP4 or WebM.') }} />
            {source.audioOnly && <div className="audio-placeholder"><Headphones size={42} /><span>{source.name}</span></div>}
            {caption && <div className="captions"><strong>{caption}</strong></div>}
            {!player.playing && <button className="play" aria-label="Play video" onClick={() => { previewRef.current?.pause(); player.toggle() }}><Play size={26} fill="currentColor" /></button>}
          </div>
          <audio ref={audioRef} preload="auto" onError={() => { player.pause(); setFileError('Translated audio could not be loaded. Select the original audio or retry.') }} />
          <div className="controls">
            <button aria-label="Restart video" onClick={() => player.seek(0)}><RotateCcw size={16} /></button>
            <button className="primary-control" aria-label={player.playing ? 'Pause video' : 'Play video'} onClick={() => { previewRef.current?.pause(); player.toggle() }}>{player.playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button>
            <input aria-label="Video position" type="range" min={0} max={duration || 1} step={0.05} value={player.time} onChange={(event) => player.seek(Number(event.target.value))} />
            <span>{clock(player.time)} / {clock(duration)}</span>
          </div>
          <p className="playback-note" role="status">{player.playing ? player.state : 'Ready to play'}{targetCode !== 'original' ? ' · Translation buffers a short section ahead.' : ''}</p>
        </section>
        <aside>
          <div className="aside-head"><p>LANGUAGE</p><span>{preparing ? `${completed}/${total || '…'} sections` : session.job?.status === 'ready' ? 'Captions prepared' : ''}</span></div>
          <section className="detected"><small>SOURCE LANGUAGE</small><div><span>{session.job?.language ?? (preparing ? 'Identifying speech…' : 'Not yet identified')}</span></div><p>{session.job?.language ? 'Estimated from the transcribed speech.' : 'Waiting for enough clear speech to identify the language.'}</p></section>
          <label className="language-select"><small>TRANSLATE TO</small><div><Languages size={18} /><select aria-describedby="translation-help" value={targetCode} onChange={(event) => { previewRef.current?.pause(); setTargetCode(event.target.value) }}><option value="original">Original · no translation</option>{targetLanguages.map((language) => <option key={language.code} value={language.code}>{language.name}</option>)}</select><ChevronDown size={15} /></div></label>
          <p className="translation-help" id="translation-help">Choose a language to change both the voice and captions. Switch languages at any point.</p>
          {targetName && <button className="translate-button" onClick={() => { previewRef.current?.pause(); player.play() }} disabled={player.playing}><Volume2 size={16} /><span>{player.playing ? `${targetName} audio selected` : `Translate & play in ${targetName}`}</span></button>}
          <section className="output-card"><small>{targetCode === 'original' ? 'SOURCE CAPTION' : 'TRANSLATED CAPTION'}</small><p>{caption || (!player.playing ? 'Press play. Captions appear as the video progresses.' : preparing && !segment?.text ? 'Preparing captions for this section…' : targetName && dub?.state !== 'ready' ? player.state : 'Listening…')}</p><div className={player.playing ? 'active' : ''}><i /><span>{player.playing ? player.state : 'Paused'}</span></div></section>
          {session.job?.extractedAudioUrl && <details className="audio-check"><summary>Check extracted audio</summary><p>Listen to the exact track used for transcription.</p><audio ref={previewRef} src={session.job.extractedAudioUrl} controls onPlay={player.pause} /><small>24 kHz mono · {session.job.rmsDb?.toFixed(1)} dBFS RMS</small></details>}
          {session.job?.segments.length ? <details className="transcript-check"><summary>Source transcript ({completed}/{total})</summary><div>{session.job.segments.map((item) => <button key={item.index} onClick={() => player.seek(item.start)}><small>{clock(item.start)}</small><span>{item.text || item.error || (item.state === 'ready' ? 'No speech' : 'Transcribing…')}</span></button>)}</div></details> : null}
        </aside>
      </div>}
      {error && <p className="error" role="alert">{error}</p>}
      <input ref={fileRef} hidden type="file" accept="video/*,audio/*" onChange={(event) => { void loadFile(event.target.files?.[0]); event.target.value = '' }} />
    </main>
  </div>
}
