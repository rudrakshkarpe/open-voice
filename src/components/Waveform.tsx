import { useEffect, useRef } from 'react'

type WaveformProps = { analyser: AnalyserNode | null; color: string; active: boolean }

export function Waveform({ analyser, color, active }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    let animationFrame = 0
    const data = new Uint8Array(analyser?.frequencyBinCount ?? 64)
    const draw = () => {
      const scale = window.devicePixelRatio || 1
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (canvas.width !== width * scale || canvas.height !== height * scale) {
        canvas.width = width * scale
        canvas.height = height * scale
      }
      context.setTransform(scale, 0, 0, scale, 0, 0)
      context.clearRect(0, 0, width, height)
      if (analyser) analyser.getByteFrequencyData(data)
      const bars = 42
      const gap = 3
      const barWidth = Math.max(2, (width - gap * (bars - 1)) / bars)
      context.shadowColor = color
      context.shadowBlur = active ? 12 : 0
      for (let index = 0; index < bars; index += 1) {
        const sampleIndex = Math.floor((index / bars) * data.length * 0.68)
        const idle = 0.08 + Math.sin(index * 0.7) * 0.025
        const strength = active && analyser ? Math.max(0.06, data[sampleIndex] / 255) : idle
        const barHeight = Math.max(3, strength * height * 0.88)
        const x = index * (barWidth + gap)
        const gradient = context.createLinearGradient(0, height - barHeight, 0, height)
        gradient.addColorStop(0, color)
        gradient.addColorStop(1, `${color}28`)
        context.fillStyle = gradient
        context.beginPath()
        context.roundRect(x, (height - barHeight) / 2, barWidth, barHeight, barWidth / 2)
        context.fill()
      }
      animationFrame = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(animationFrame)
  }, [active, analyser, color])

  return <canvas className="waveform" ref={canvasRef} aria-label="Live audio waveform" />
}
