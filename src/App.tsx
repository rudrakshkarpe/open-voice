import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Captions, Check, ChevronDown, Headphones, Languages, Pause, Play, RotateCcw, Video, Volume2 } from 'lucide-react'
import { useMediaSession } from './hooks/useMediaSession'
import { useDubPlayer } from './hooks/useDubPlayer'
import { Welcome } from './components/Welcome'
import { targetLanguages } from './lib/languages'
import { captionAt, captionCues } from './lib/captions'
import { isAudioFile, playbackNotice, validateMediaFile } from './lib/experience'
import { apiUrl } from './lib/api'

const clock = (time: number) => `${Math.floor(time / 60)}:${Math.floor(time % 60).toString().padStart(2, '0')}`
const debug = new URLSearchParams(window.location.search).get('debug') === '1'

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
  const [showCaptions, setShowCaptions] = useState(true)
  const session = useMediaSession()
  const player = useDubPlayer(session.job, targetCode)
  const { videoRef } = player
  const sourceRef = useRef('')
  const loadRevision = useRef(0)
  const mediaUrl = remote ? session.job?.videoUrl ? apiUrl(session.job.videoUrl) : '' : source.url
  const mediaName = remote ? session.job?.name ?? 'YouTube video' : source.name
  const hasSource = Boolean(source.url || remote)
  const activeTrack = session.job?.tracks[player.activeLanguage]
  const segment = (player.activeLanguage === 'original' ? session.job?.segments : activeTrack?.segments)?.find((item) => player.time >= item.start && player.time < ('captionEnd' in item ? item.captionEnd : item.end))
  const captionText = segment?.text
  const captionEnd = segment && 'captionEnd' in segment ? segment.captionEnd : segment?.end
  const cues = useMemo(() => captionCues(captionText ?? '', segment?.start ?? 0, captionEnd ?? 0), [captionText, segment?.start, captionEnd])
  const caption = captionAt(cues, player.time)
  const targetName = targetLanguages.find((language) => language.code === targetCode)?.name ?? 'Original audio'
  const activeName = targetLanguages.find((language) => language.code === player.activeLanguage)?.name ?? 'Original audio'
  const error = fileError || player.error || session.error || session.job?.error
  const preparing = session.uploading || ['queued', 'importing', 'extracting', 'transcribing'].includes(session.job?.status ?? '')
  const importMessage = session.message || session.job?.message || 'Opening your video…'
  const notice = playbackNotice({ phase: player.phase, playing: player.playing, activeName, targetName, switching: targetCode !== player.activeLanguage, failed: Boolean(player.translationError) })
  const actuallyPlaying = player.playing && player.phase === 'playing'

  useEffect(() => () => { if (sourceRef.current.startsWith('blob:')) URL.revokeObjectURL(sourceRef.current) }, [])

  const clearSource = () => {
    loadRevision.current++
    player.reset(); previewRef.current?.pause(); session.clear()
    if (sourceRef.current.startsWith('blob:')) URL.revokeObjectURL(sourceRef.current)
    sourceRef.current = ''; setSource({ url: '', name: '', audioOnly: false }); setRemote(false)
    setTargetCode('original'); setDuration(0); setRatio(16 / 9); setFileError('')
  }
  const loadFile = async (file?: File) => {
    if (!file) return
    const validationError = validateMediaFile(file)
    if (validationError) { setFileError(validationError); return }
    loadRevision.current++; player.reset(); previewRef.current?.pause(); setFileError(''); setTargetCode('original'); setDuration(0); setRatio(16 / 9); setRemote(false)
    if (sourceRef.current.startsWith('blob:')) URL.revokeObjectURL(sourceRef.current)
    const url = URL.createObjectURL(file); sourceRef.current = url
    setSource({ url, name: file.name, audioOnly: isAudioFile(file) })
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
      const response = await fetch(`${import.meta.env.BASE_URL}media/demo-source.mp4`)
      if (!response.ok) throw new Error('Sample could not be loaded.')
      const blob = await response.blob()
      if (revision === loadRevision.current) await loadFile(new File([blob], 'A moment on the court.mp4', { type: 'video/mp4' }))
    } catch { if (revision === loadRevision.current) setFileError('The sample couldn’t open. Try again or bring your own video.') }
  }
  const togglePlayback = () => { previewRef.current?.pause(); player.toggle() }

  return <div className="shell">
    <header className="site-header">
      <button className="logo" onClick={clearSource} aria-label="Openvoice home"><span><Languages size={20} /></span>openvoice</button>
      {hasSource ? <button className="new-video" onClick={clearSource}><ArrowLeft size={15} />New video</button> : <span className="header-note">Same story. Your language.</span>}
    </header>
    <main className={`${hasSource ? 'has-source' : ''} ${hasSource && !source.audioOnly && ratio < 1 ? 'is-portrait' : ''} ${dragging ? 'drag-over' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void loadFile(event.dataTransfer.files[0]) }}>
      {error && <div className="error-banner" role="alert"><p>{error}</p>{remote && !mediaUrl && !session.uploading && <button onClick={() => void loadYoutube()}>Try this link again<RotateCcw size={14} /></button>}{hasSource && <button onClick={clearSource}>Choose another video<ArrowLeft size={14} /></button>}</div>}
      {!hasSource ? <Welcome dragging={dragging} youtubeInput={youtubeInput} setYoutubeInput={setYoutubeInput} onYoutube={() => void loadYoutube()} onUpload={() => fileRef.current?.click()} onSample={loadSample} /> : <>
        <div className="workspace-heading"><div>{source.audioOnly ? <Headphones size={17} /> : <Video size={17} />}<h1 title={mediaName}>{mediaName}</h1></div><span className={`playback-status ${actuallyPlaying ? 'is-playing' : ''}`}><i />{error && !mediaUrl ? 'Couldn’t open video' : actuallyPlaying ? 'Playing' : player.phase === 'finished' ? 'Finished' : player.playing ? 'One moment…' : !mediaUrl ? 'Opening video…' : player.time > 0 ? 'Paused' : 'Ready to play'}</span></div>
        <div className="workspace">
          <section className="player-column" aria-label="Media player">
            <div className="video-frame" style={{ aspectRatio: String(source.audioOnly ? 16 / 9 : ratio), maxWidth: `${(source.audioOnly ? 16 / 9 : ratio) * 65}vh` }}>
              <video ref={videoRef} src={mediaUrl || undefined} playsInline preload="auto" onWaiting={player.buffering} onLoadedMetadata={(event) => {
                const media = event.currentTarget; setDuration(Number.isFinite(media.duration) ? media.duration : 0)
                if (media.videoWidth && media.videoHeight) setRatio(media.videoWidth / media.videoHeight)
              }} onError={() => { player.pause(); setFileError('This browser can’t play this file. Try an H.264 MP4 or WebM.') }} />
              {source.audioOnly && <div className="audio-placeholder"><span><Headphones size={40} strokeWidth={1.25} /></span><strong>Just press play.</strong><p>Your audio, in a new language.</p></div>}
              {!mediaUrl && <div className="import-placeholder" role="status" aria-live="polite"><Video size={28} strokeWidth={1.25} /><h2>{error ? 'This video couldn’t open.' : importMessage}</h2><p>{error ? 'Try this link again, or upload a file you have permission to use.' : 'You can choose a language while we get it ready. No need to resubmit the link.'}</p></div>}
              {showCaptions && caption && <div className="captions" lang={player.activeLanguage === 'original' ? undefined : player.activeLanguage}><strong dir="auto">{caption}</strong></div>}
              {mediaUrl && !player.playing && <button className="play" aria-label="Play video" onClick={togglePlayback}><Play size={26} fill="currentColor" /></button>}
            </div>
            <div className="controls">
              <button className="primary-control" disabled={!mediaUrl} aria-label={player.playing ? 'Pause video' : 'Play video'} onClick={togglePlayback}>{player.playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
              <button className="restart-control" disabled={!mediaUrl} aria-label="Restart video" onClick={() => player.seek(0)}><RotateCcw size={17} /></button>
              <input aria-label="Video position" aria-valuetext={`${clock(player.time)} of ${clock(duration)}`} disabled={!duration} type="range" min={0} max={duration || 1} step={0.05} value={player.time} onChange={(event) => player.seek(Number(event.target.value))} />
              <span className="timecode">{clock(player.time)}<span> / {clock(duration)}</span></span>
              <button className={`captions-control ${showCaptions ? 'selected' : ''}`} aria-label="Show captions" aria-pressed={showCaptions} onClick={() => setShowCaptions((value) => !value)}><Captions size={20} /></button>
            </div>
          </section>
          <aside className="language-panel" aria-label="Playback language">
            <div className="panel-title"><Headphones size={18} /><h2>Audio & captions</h2></div>
            <label className="language-select" htmlFor="playback-language"><span>Listen in</span><div><Languages size={20} /><select id="playback-language" aria-describedby="translation-help" value={targetCode} onChange={(event) => { previewRef.current?.pause(); setTargetCode(event.target.value) }}><option value="original">Original audio</option>{targetLanguages.map((language) => <option key={language.code} value={language.code}>{language.name}</option>)}</select><ChevronDown size={17} /></div></label>
            <p className="translation-help" id="translation-help">Choose a language. The audio switches for you.</p>
            <div className="listening-notice" role="status" aria-atomic="true"><span className={notice.busy ? 'notice-icon pending' : 'notice-icon'}>{notice.busy ? <span className="pending-dot" /> : actuallyPlaying ? <Volume2 size={16} /> : <Check size={16} />}</span><div><strong>{notice.title}</strong><p>{notice.detail}</p></div></div>
            {player.translationError && <div className="translation-error" role="alert"><p>{player.translationError}</p><button onClick={player.retry}><RotateCcw size={14} />Try again</button></div>}
            <div className="source-language"><span>Source language</span><strong>{session.job?.language ?? (preparing ? 'Detecting…' : 'Not identified')}</strong></div>
            <p className="caption-note"><Captions size={16} />{showCaptions ? 'Captions follow the audio.' : 'Captions are off.'}</p>
          </aside>
        </div>
        {debug && <details className="diagnostics"><summary>Developer diagnostics</summary><p>{player.state}</p><p>{player.buffered.toFixed(1)}s buffered · {player.audioStarts} stream starts · {player.stalls} rebuffer events · sync drift {player.drift} ms</p>{player.activity.map((item, index) => <p key={`${index}-${item}`}>{item}</p>)}
          {session.job?.extractedAudioUrl && <details><summary>Extracted audio</summary><audio ref={previewRef} src={apiUrl(session.job.extractedAudioUrl)} controls onPlay={player.pause} /><p>24 kHz mono · {session.job.rmsDb?.toFixed(1)} dBFS RMS</p></details>}
          <details><summary>Source transcript</summary><div className="transcript">{session.job?.segments.map((item) => <button key={item.index} onClick={() => player.seek(item.start)}><time>{clock(item.start)}</time><span>{item.text || item.error || (item.state === 'ready' ? 'No speech' : 'Transcribing…')}</span></button>)}</div></details>
        </details>}
      </>}
      <input ref={fileRef} hidden type="file" accept="video/*,audio/*,.mp4,.mov,.webm,.mp3,.wav,.m4a,.ogg,.flac" onChange={(event) => { void loadFile(event.target.files?.[0]); event.target.value = '' }} />
    </main>
  </div>
}
