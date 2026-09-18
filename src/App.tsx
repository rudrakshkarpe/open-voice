import { useMemo, useRef, useState } from 'react'
import { Activity, AudioLines, Check, ChevronDown, CircleStop, Cloud, Code2, Gauge, Mic2, Pause, Play, Radio, RotateCcw, Sparkles, Upload, WandSparkles, Waves, Zap } from 'lucide-react'
import { HiggsStudio } from './components/HiggsStudio'
import { Waveform } from './components/Waveform'
import { useVoiceProcessor } from './hooks/useVoiceProcessor'
import { voicePresets, type VoicePreset } from './lib/voices'

type SwitchEvent = { id: number; voice: VoicePreset; time: number }
const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const eventIdRef = useRef(0)
  const [activeVoice, setActiveVoice] = useState(voicePresets[0])
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(73.881)
  const [sourceName, setSourceName] = useState('demo-source.mp4')
  const [engineMode, setEngineMode] = useState<'live' | 'higgs'>('live')
  const [dragging, setDragging] = useState(false)
  const [events, setEvents] = useState<SwitchEvent[]>([{ id: 0, voice: voicePresets[0], time: 0 }])
  const processor = useVoiceProcessor(voicePresets[0])
  const progress = duration ? (currentTime / duration) * 100 : 0
  const orderedEvents = useMemo(() => [...events].sort((a, b) => a.time - b.time), [events])

  const initialize = async () => {
    const video = videoRef.current
    if (!video) return
    await processor.connect(video)
    if (video.paused) await video.play()
  }

  const togglePlayback = async () => {
    const video = videoRef.current
    if (!video) return
    if (!processor.isReady) return initialize()
    if (video.paused) await video.play()
    else video.pause()
  }

  const selectVoice = async (voice: VoicePreset) => {
    if (!processor.isReady) await initialize()
    processor.switchPreset(voice)
    setActiveVoice(voice)
    eventIdRef.current += 1
    setEvents((current) => [...current, { id: eventIdRef.current, voice, time: videoRef.current?.currentTime ?? 0 }])
  }

  const loadFile = (file?: File) => {
    if (!file || !videoRef.current) return
    videoRef.current.pause()
    videoRef.current.src = URL.createObjectURL(file)
    videoRef.current.load()
    setSourceName(file.name)
    setCurrentTime(0)
    setPlaying(false)
    eventIdRef.current += 1
    setEvents([{ id: eventIdRef.current, voice: activeVoice, time: 0 }])
  }

  const restart = () => {
    if (!videoRef.current) return
    videoRef.current.currentTime = 0
    setCurrentTime(0)
    eventIdRef.current += 1
    setEvents([{ id: eventIdRef.current, voice: activeVoice, time: 0 }])
  }

  return (
    <div className="app-shell" style={{ '--voice-color': activeVoice.color } as React.CSSProperties}>
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="topbar">
        <a className="brand" href="#studio"><span className="brand-mark"><AudioLines size={20} /></span><span>open<span>voice</span></span></a>
        <div className="session-pill"><span /> LIVE SESSION <b>01</b></div>
        <div className="top-actions"><button className="ghost-button"><Code2 size={16} /> SDK</button><button className="avatar-button">RK</button></div>
      </header>

      <main id="studio" className="studio-grid">
        <section className={`stage-panel glass-panel ${dragging ? 'dragging' : ''}`}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false) }}
          onDrop={(event) => { event.preventDefault(); setDragging(false); loadFile(event.dataTransfer.files[0]) }}>
          <div className="panel-heading">
            <div><p className="eyebrow"><Radio size={13} /> SOURCE STREAM</p><h1>Make every voice<br /><em>feel alive.</em></h1></div>
            <button className="source-picker" onClick={() => fileInputRef.current?.click()}><Upload size={15} /> Replace media</button>
            <input ref={fileInputRef} type="file" accept="audio/*,video/*" hidden onChange={(event) => loadFile(event.target.files?.[0])} />
          </div>
          <div className="video-stage">
            <div className="video-glow" style={{ background: activeVoice.gradient }} />
            <video ref={videoRef} src="/media/demo-source.mp4" poster="/media/demo-poster.jpg" playsInline onClick={togglePlayback}
              onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
              onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
            <div className="video-topline"><span><Activity size={13} /> INPUT • 48 KHZ</span><span className="on-air"><i /> ON AIR</span></div>
            {!playing && <button className="hero-play" onClick={togglePlayback}><Play size={28} fill="currentColor" /></button>}
            <div className="active-voice-badge"><span style={{ background: activeVoice.gradient }}><Mic2 size={17} /></span><div><small>OUTPUT VOICE</small><strong>{activeVoice.name}</strong></div><Sparkles size={16} /></div>
            {dragging && <div className="drop-overlay"><Upload size={28} /><strong>Drop any audio or video</strong><small>MP4 · MOV · WEBM · MP3 · WAV</small></div>}
          </div>
          <div className="transport">
            <button onClick={restart}><RotateCcw size={17} /></button><button className="transport-main" onClick={togglePlayback}>{playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
            <span>{formatTime(currentTime)}</span>
            <div className="scrubber"><input type="range" min="0" max={duration || 0} step="0.01" value={currentTime} style={{ '--progress': `${progress}%` } as React.CSSProperties}
              onChange={(event) => { const next = Number(event.target.value); if (videoRef.current) videoRef.current.currentTime = next; setCurrentTime(next) }} />
              {orderedEvents.slice(1).map((event) => <i key={event.id} className="timeline-marker" style={{ left: `${(event.time / duration) * 100}%`, background: event.voice.color }} />)}
            </div>
            <span>{formatTime(duration)}</span><button><CircleStop size={17} /></button>
          </div>
          <div className="file-row"><span>{sourceName}</span><b>{Math.round(progress)}% streamed</b></div>
        </section>

        <section className="control-panel glass-panel">
          <div className="control-header"><div><p className="eyebrow"><Zap size={13} /> VOICE ENGINE</p><h2>{engineMode === 'live' ? 'Switch the energy.' : 'Speak every language.'}</h2></div><div className={`engine-state ${processor.isReady || engineMode === 'higgs' ? 'ready' : ''}`}><span /> {engineMode === 'higgs' ? 'BOSON API' : processor.isReady ? 'ENGINE LIVE' : 'STANDBY'}</div></div>
          <div className="engine-tabs"><button className={engineMode === 'live' ? 'active' : ''} onClick={() => setEngineMode('live')}><Waves size={14} /> Live FX</button><button className={engineMode === 'higgs' ? 'active' : ''} onClick={() => setEngineMode('higgs')}><WandSparkles size={14} /> Higgs TTS</button></div>
          {engineMode === 'live' ? <>
            <div className="wave-card"><div className="wave-meta"><span><Waves size={15} /> REALTIME SIGNAL</span><b>{activeVoice.label}</b></div><Waveform analyser={processor.analyser} color={activeVoice.color} active={playing} /></div>
            <div className="voice-label-row"><span>VOICE PROFILES</span><button>5 loaded <ChevronDown size={13} /></button></div>
            <div className="voice-list">
            {voicePresets.map((voice, index) => {
              const selected = voice.id === activeVoice.id
              return <button className={`voice-card ${selected ? 'selected' : ''}`} key={voice.id} onClick={() => selectVoice(voice)} style={{ '--card-color': voice.color } as React.CSSProperties}>
                <span className="voice-number">0{index + 1}</span><span className="voice-icon" style={{ background: voice.gradient }}><AudioLines size={18} /></span>
                <span className="voice-copy"><strong>{voice.name}</strong><small>{voice.description}</small></span><span className="voice-tag">{voice.label}</span><span className="check-circle">{selected && <Check size={13} strokeWidth={3} />}</span>
              </button>
            })}
            </div>
            <div className="switch-note"><Gauge size={16} /><span><strong>Zero-reload switching</strong> Smooth parameter ramps prevent clicks between profiles.</span></div>
          </> : <HiggsStudio />}
        </section>
      </main>

      <section className="integration-rail">
        <div className="rail-title"><span>POWERED BY</span><strong>Open voice infrastructure</strong></div>
        <div className="integration"><span className="integration-logo boson">B</span><div><strong>Boson · Higgs</strong><small>Generative voice adapter</small></div><i className="adapter" /></div>
        <div className="integration"><span className="integration-logo livekit"><Radio size={17} /></span><div><strong>LiveKit</strong><small>Realtime transport</small></div><i className="planned" /></div>
        <div className="integration"><span className="integration-logo webaudio"><Waves size={17} /></span><div><strong>Web Audio</strong><small>Local DSP fallback</small></div><i className="adapter" /></div>
        <div className="rail-status"><Cloud size={15} /><span>0 network hops in demo mode</span></div>
      </section>
    </div>
  )
}
