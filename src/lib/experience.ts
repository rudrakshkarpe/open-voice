export const mediaLimits = { bytes: 200 * 1024 * 1024, minutes: 10 }

type FileDescription = { name: string; size: number; type: string }

export function validateMediaFile(file: FileDescription) {
  if (file.size === 0) return 'This file is empty. Choose another audio or video file.'
  if (file.size > mediaLimits.bytes) return 'This file is over 200 MB. Try a shorter clip or a smaller export.'
  if (!/^(video|audio)\//.test(file.type) && !/\.(mp4|mov|webm|mp3|wav|m4a|ogg|flac)$/i.test(file.name)) return 'Choose an audio or video file, such as MP4, WebM, MP3 or WAV.'
  return ''
}

export function isAudioFile(file: Pick<FileDescription, 'type' | 'name'>) {
  return file.type.startsWith('audio/') || (!file.type.startsWith('video/') && /\.(mp3|wav|m4a|ogg|flac)$/i.test(file.name))
}

export type PlaybackPhase = 'paused' | 'playing' | 'waiting-audio' | 'waiting-video' | 'finished'

export function playbackNotice({ phase, playing, activeName, targetName, switching, failed }: {
  phase: PlaybackPhase; playing: boolean; activeName: string; targetName: string; switching: boolean; failed: boolean
}) {
  // A real interruption takes precedence over an otherwise non-blocking switch.
  if (phase === 'waiting-audio') return { title: 'Catching up with the next phrase…', detail: 'Playback will resume automatically.', busy: true }
  if (phase === 'waiting-video') return { title: 'Waiting for the video…', detail: 'Playback will resume automatically.', busy: true }
  if (phase === 'finished') return { title: 'That’s a wrap.', detail: 'Press play to watch again.', busy: false }
  if (failed) return { title: `${targetName} couldn’t connect`, detail: `${activeName} is still selected. Try again or choose another language.`, busy: false }
  if (switching) return { title: `Switching to ${targetName}…`, detail: playing ? `${activeName} continues in the meantime.` : 'The switch happens automatically when the first phrase is ready.', busy: true }
  return { title: activeName, detail: playing ? 'Playing now' : 'Press play when you’re ready.', busy: false }
}
