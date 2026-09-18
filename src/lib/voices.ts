export type VoicePreset = {
  id: string
  name: string
  label: string
  description: string
  color: string
  gradient: string
  filter: {
    highpass: number
    lowpass: number
    presenceFrequency: number
    presenceGain: number
    compression: number
    distortion: number
    output: number
  }
}

export const voicePresets: VoicePreset[] = [
  {
    id: 'source', name: 'Trueform', label: 'Natural',
    description: 'Clean source voice with a transparent finish.', color: '#a78bfa',
    gradient: 'linear-gradient(135deg, #a78bfa, #6d5dfc)',
    filter: { highpass: 24, lowpass: 20000, presenceFrequency: 1800, presenceGain: 0, compression: -14, distortion: 0, output: 1 },
  },
  {
    id: 'noir', name: 'Midnight', label: 'Deep & warm',
    description: 'A grounded cinematic profile with softened air.', color: '#f472b6',
    gradient: 'linear-gradient(135deg, #fb7185, #a855f7)',
    filter: { highpass: 38, lowpass: 6800, presenceFrequency: 220, presenceGain: 7, compression: -22, distortion: 5, output: 1.08 },
  },
  {
    id: 'signal', name: 'Airwave', label: 'Broadcast',
    description: 'Focused presence built to cut through any stream.', color: '#22d3ee',
    gradient: 'linear-gradient(135deg, #22d3ee, #3b82f6)',
    filter: { highpass: 150, lowpass: 8800, presenceFrequency: 2600, presenceGain: 8, compression: -30, distortion: 3, output: 1.12 },
  },
  {
    id: 'sunrise', name: 'Daylight', label: 'Bright & crisp',
    description: 'Open, energetic tone with polished top-end clarity.', color: '#fbbf24',
    gradient: 'linear-gradient(135deg, #fbbf24, #fb7185)',
    filter: { highpass: 80, lowpass: 15800, presenceFrequency: 4200, presenceGain: 7, compression: -20, distortion: 1, output: 1.02 },
  },
  {
    id: 'cosmic', name: 'Hologram', label: 'Synthetic',
    description: 'A sharp digital edge for characters and game worlds.', color: '#34d399',
    gradient: 'linear-gradient(135deg, #34d399, #06b6d4)',
    filter: { highpass: 320, lowpass: 5200, presenceFrequency: 1450, presenceGain: 11, compression: -36, distortion: 36, output: 0.92 },
  },
]
