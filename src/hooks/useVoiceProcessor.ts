import { useCallback, useRef, useState } from 'react'
import type { VoicePreset } from '../lib/voices'

type AudioGraph = {
  context: AudioContext
  source: MediaElementAudioSourceNode
  highpass: BiquadFilterNode
  lowpass: BiquadFilterNode
  presence: BiquadFilterNode
  distortion: WaveShaperNode
  compressor: DynamicsCompressorNode
  gain: GainNode
  analyser: AnalyserNode
}

const makeDistortionCurve = (amount: number) => {
  const samples = 44100
  const curve = new Float32Array(samples)
  const degree = Math.PI / 180
  for (let index = 0; index < samples; index += 1) {
    const x = (index * 2) / samples - 1
    curve[index] = amount === 0 ? x : ((3 + amount) * x * 20 * degree) / (Math.PI + amount * Math.abs(x))
  }
  return curve
}

export function useVoiceProcessor(initialPreset: VoicePreset) {
  const graphRef = useRef<AudioGraph | null>(null)
  const presetRef = useRef(initialPreset)
  const [isReady, setIsReady] = useState(false)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)

  const applyPreset = useCallback((preset: VoicePreset, graph: AudioGraph) => {
    const now = graph.context.currentTime
    const smooth = (parameter: AudioParam, value: number) => {
      parameter.cancelScheduledValues(now)
      parameter.setTargetAtTime(value, now, 0.055)
    }
    smooth(graph.highpass.frequency, preset.filter.highpass)
    smooth(graph.lowpass.frequency, preset.filter.lowpass)
    smooth(graph.presence.frequency, preset.filter.presenceFrequency)
    smooth(graph.presence.gain, preset.filter.presenceGain)
    smooth(graph.compressor.threshold, preset.filter.compression)
    smooth(graph.gain.gain, preset.filter.output)
    graph.distortion.curve = makeDistortionCurve(preset.filter.distortion)
    graph.distortion.oversample = '4x'
  }, [])

  const connect = useCallback(async (element: HTMLMediaElement) => {
    if (graphRef.current) {
      await graphRef.current.context.resume()
      return graphRef.current
    }
    const context = new AudioContext({ latencyHint: 'interactive' })
    const source = context.createMediaElementSource(element)
    const highpass = context.createBiquadFilter()
    const lowpass = context.createBiquadFilter()
    const presence = context.createBiquadFilter()
    const distortion = context.createWaveShaper()
    const compressor = context.createDynamicsCompressor()
    const gain = context.createGain()
    const analyserNode = context.createAnalyser()
    highpass.type = 'highpass'
    lowpass.type = 'lowpass'
    presence.type = 'peaking'
    presence.Q.value = 0.8
    compressor.ratio.value = 5
    compressor.attack.value = 0.008
    compressor.release.value = 0.18
    analyserNode.fftSize = 256
    analyserNode.smoothingTimeConstant = 0.82
    source.connect(highpass).connect(lowpass).connect(presence).connect(distortion).connect(compressor).connect(gain).connect(analyserNode).connect(context.destination)
    const graph = { context, source, highpass, lowpass, presence, distortion, compressor, gain, analyser: analyserNode }
    graphRef.current = graph
    applyPreset(presetRef.current, graph)
    await context.resume()
    setAnalyser(analyserNode)
    setIsReady(true)
    return graph
  }, [applyPreset])

  const switchPreset = useCallback((preset: VoicePreset) => {
    presetRef.current = preset
    if (graphRef.current) applyPreset(preset, graphRef.current)
  }, [applyPreset])

  return { connect, switchPreset, isReady, analyser }
}
