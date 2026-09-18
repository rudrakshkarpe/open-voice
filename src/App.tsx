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
  const [youtubeInput, setYoutubeInput] = useState('')
  const [remote, setRemote] = useState(false)
  const session = useMediaSession()
  const player = useDubPlayer(session.job, targetCode)
  const { videoRef } = player
  const sourceRef = useRef('')
  const loadRevision = useRef(0)
  const mediaUrl = remote ? session.job?.videoUrl ?? '' : source.url
  const mediaName = remote ? session.job?.name ?? 'YouTube video' : source.name
  const hasSource = Boolean(source.url || remote)
  const activeTrack = session.job?.tracks[player.activeLanguage]
  const requestedTrack = session.job?.tracks[targetCode]
  const segment = (player.activeLanguage === 'original' ? session.job?.segments : activeTrack?.segments)?.find((item) => player.time >= item.start && player.time < ('captionEnd' in item ? item.captionEnd : item.end))
  const captionText = segment?.text
  const captionEnd = segment && 'captionEnd' in segment ? segment.captionEnd : segment?.end
  const cues = useMemo(() => captionCues(captionText ?? '', segment?.start ?? 0, captionEnd ?? 0), [captionText, segment?.start, captionEnd])
  const caption = captionAt(cues, player.time)
  const targetName = targetLanguages.find((language) => language.code === targetCode)?.name
  const activeName = targetLanguages.find((language) => language.code === player.activeLanguage)?.name ?? 'Original'
  const completed = session.job?.segments.filter((item) => item.state === 'ready').length ?? 0
  const total = session.job?.segments.length ?? 0
  const error = fileError || player.error || session.error || session.job?.error
  const preparing = session.uploading || ['importing', 'extracting', 'transcribing'].includes(session.job?.status ?? '')

  useEffect(() => () => { if (sourceRef.current.startsWith('blob:')) URL.revokeObjectURL(sourceRef.current) }, [])

  const loadFile = async (file?: File) => {
    if (!file) return
    if (file.size > 200 * 1024 * 1024) { setFileError('Use a file smaller than 200 MB.'); return }
    if (!/^(video|audio)\//.test(file.type) && !/\.(mp4|mov|webm|mp3|wav|m4a|ogg|flac)$/i.test(file.name)) { setFileError('Choose an audio or video file.'); return }
    loadRevision.current++; player.reset(); previewRef.current?.pause(); setFileError(''); setTargetCode('original'); setDuration(0); setRatio(16 / 9); setRemote(false)
    if (sourceRef.current.startsWith('blob:')) URL.revokeObjectURL(sourceRef.current)
    const url = URL.createObjectURL(file); sourceRef.current = url
    setSource({ url, name: file.name, audioOnly: file.type.startsWith('audio/') })
    await session.upload(file)
  }
  const loadYoutube = async () => {
    if (!youtubeInput.trim()) return
    loadRevision.current++; player.reset(); previewRef.current?.pause(); setFileError(''); setTargetCode('original'); setDuration(0); setRatio(16 / 9)
    if (sourceRef.current.startsWith('blob:')) URL.revokeObjectURL(sourceRef.current)
    sourceRef.current = ''; setSource({ url: '', name: '', audioOnly: false }); setRemote(true)
    await session.importUrl(youtubeInput.trim())
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
      <div className={`status ${player.playing ? 'live' : ''}`}><i />{player.playing ? `Playing ${activeName}` : preparing ? 'Preparing video' : hasSource ? 'Paused' : 'Ready'}</div>
    </header>
    <main className={hasSource ? 'has-source' : ''} onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void loadFile(event.dataTransfer.files[0]) }}>
      <form className="youtube-form" onSubmit={(event) => { event.preventDefault(); void loadYoutube() }}>
        <label htmlFor="youtube-url">YouTube video</label><div><input id="youtube-url" type="url" placeholder="Paste a YouTube link…" value={youtubeInput} onChange={(event) => setYoutubeInput(event.target.value)} required /><button type="submit" disabled={session.uploading || !youtubeInput.trim()}>Load video</button></div>
        <small>Public recorded clips · up to 10 minutes · only media you have permission to process</small>
      </form>
      {!hasSource ? <section className={`welcome ${dragging ? 'dragging' : ''}`}>
        <div className="welcome-copy"><p>VIDEO TRANSLATION</p><h1>Every video,<br />in your language.</h1><span>Paste a YouTube link or upload a clip. Translated audio starts section by section while the rest prepares ahead.</span></div>
        <button className="dropzone" onClick={() => fileRef.current?.click()}><span><Upload size={23} /></span><strong>{dragging ? 'Drop it here' : 'Upload a video'}</strong><small>Audio or video · up to 200 MB / 10 minutes</small></button>
        <button className="sample-button" onClick={() => void loadSample()}><Play size={12} fill="currentColor" /> Try the sample video</button>
      </section> : <div className="workspace">
        <section className="player-column">
          <div className="source-bar"><div><Video size={14} /><span>{mediaName}</span></div><button onClick={() => fileRef.current?.click()}><Upload size={13} /> Replace</button></div>
          <div className="video-frame" style={{ aspectRatio: String(source.audioOnly ? 16 / 9 : ratio), maxWidth: `${(source.audioOnly ? 16 / 9 : ratio) * 65}vh` }}>
            <video ref={videoRef} src={mediaUrl || undefined} playsInline preload="auto" onWaiting={player.buffering} onLoadedMetadata={(event) => {
              const media = event.currentTarget; setDuration(Number.isFinite(media.duration) ? media.duration : 0)
              if (media.videoWidth && media.videoHeight) setRatio(media.videoWidth / media.videoHeight)
            }} onError={() => { player.pause(); setFileError('This browser cannot play this file. Try an H.264 MP4 or WebM.') }} />
            {source.audioOnly && <div className="audio-placeholder"><Headphones size={42} /><span>{source.name}</span></div>}
            {!mediaUrl && <div className="import-placeholder"><Video size={28} /><p>{session.job?.error ? 'Video import failed' : session.job?.message ?? 'Loading video…'}</p></div>}
            {caption && <div className="captions"><strong>{caption}</strong></div>}
            {mediaUrl && !player.playing && <button className="play" aria-label="Play video" onClick={() => { previewRef.current?.pause(); player.toggle() }}><Play size={26} fill="currentColor" /></button>}
          </div>
          <div className="controls">
            <button aria-label="Restart video" onClick={() => player.seek(0)}><RotateCcw size={16} /></button>
            <button className="primary-control" disabled={!mediaUrl} aria-label={player.playing ? 'Pause video' : 'Play video'} onClick={() => { previewRef.current?.pause(); player.toggle() }}>{player.playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button>
            <input aria-label="Video position" type="range" min={0} max={duration || 1} step={0.05} value={player.time} onChange={(event) => player.seek(Number(event.target.value))} />
            <span>{clock(player.time)} / {clock(duration)}</span>
          </div>
          <p className="playback-note" role="status">{player.state}</p>
        </section>
        <aside>
          <div className="aside-head"><p>LANGUAGE</p><span>{preparing ? `${completed}/${total || '…'} sections` : session.job?.status === 'ready' ? 'Captions prepared' : ''}</span></div>
          <section className="detected"><small>SOURCE LANGUAGE</small><div><span>{session.job?.language ?? (preparing ? 'Identifying speech…' : 'Not yet identified')}</span></div><p>{session.job?.language ? 'Estimated from the transcribed speech.' : 'Waiting for enough clear speech to identify the language.'}</p></section>
          <label className="language-select"><small>TRANSLATE TO</small><div><Languages size={18} /><select aria-describedby="translation-help" value={targetCode} onChange={(event) => { previewRef.current?.pause(); setTargetCode(event.target.value) }}><option value="original">Original · no translation</option>{targetLanguages.map((language) => <option key={language.code} value={language.code}>{language.name}{session.job?.tracks[language.code]?.state === 'ready' ? ' · Ready' : ''}</option>)}</select><ChevronDown size={15} /></div></label>
          <p className="translation-help" id="translation-help">Switch after a short phrase buffer—not the whole video. Current audio continues until the new voice is ready at your position. Longer phrases pace the video to the voice.</p>
          {targetName && <section className="track-progress" aria-live="polite"><strong>{player.translationError ? `${targetName} needs attention` : player.activeLanguage === targetCode ? `${targetName} · progressive stream` : `Connecting ${targetName}`}</strong><span>{requestedTrack?.message ?? 'Waiting for the first source section'}</span><progress aria-label="Sections cached in background" value={requestedTrack?.completed ?? 0} max={requestedTrack?.total || 1} /><small>Background cache · playback does not wait for 100%</small>{player.translationError && <p className="error">{player.translationError}</p>}<button className="translate-button" onClick={() => { previewRef.current?.pause(); if (player.translationError) player.retry(); else player.play() }} disabled={!mediaUrl || (player.playing && !player.translationError)}><Volume2 size={16} /><span>{player.translationError ? 'Retry stream' : player.activeLanguage === targetCode ? `Play in ${targetName}` : player.playing ? `Playing ${activeName} until the switch` : 'Play · switch when buffered'}</span></button></section>}
          <section className="output-card"><small>{activeName.toUpperCase()} CAPTIONS</small><p>{caption || (!player.playing ? 'Press play. Captions follow the active audio.' : preparing ? 'Preparing source captions…' : 'Listening…')}</p><div className={player.playing ? 'active' : ''}><i /><span>{player.playing ? `Playing ${activeName}` : 'Paused'}</span></div></section>
          {player.activity.length > 0 && <details className="audio-check"><summary>Recent switches</summary>{player.activity.map((item, index) => <p key={`${index}-${item}`}>{item}</p>)}</details>}
          {player.audioStarts > 0 && <details className="audio-check"><summary>Playback diagnostics</summary><p>{player.buffered.toFixed(1)}s buffered · {player.audioStarts} stream starts · {player.stalls} rebuffer events · sync drift {player.drift} ms</p><small>Sections are scheduled ahead on one audio clock. A slow provider can still require buffering.</small></details>}
          {session.job?.extractedAudioUrl && <details className="audio-check"><summary>Check extracted audio</summary><p>Listen to the exact track used for transcription.</p><audio ref={previewRef} src={session.job.extractedAudioUrl} controls onPlay={player.pause} /><small>24 kHz mono · {session.job.rmsDb?.toFixed(1)} dBFS RMS</small></details>}
          {session.job?.segments.length ? <details className="transcript-check"><summary>Source transcript ({completed}/{total})</summary><div>{session.job.segments.map((item) => <button key={item.index} onClick={() => player.seek(item.start)}><small>{clock(item.start)}</small><span>{item.text || item.error || (item.state === 'ready' ? 'No speech' : 'Transcribing…')}</span></button>)}</div></details> : null}
        </aside>
      </div>}
      {error && <p className="error" role="alert">{error}</p>}
      <input ref={fileRef} hidden type="file" accept="video/*,audio/*" onChange={(event) => { void loadFile(event.target.files?.[0]); event.target.value = '' }} />
    </main>
  </div>
}
