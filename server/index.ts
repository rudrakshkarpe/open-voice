import 'dotenv/config'
import { config } from 'dotenv'
import cors from 'cors'
import express from 'express'
import { existsSync } from 'node:fs'
import path from 'node:path'

config({ path: '.env.local', override: true })

const app = express()
const port = Number(process.env.PORT ?? 8787)
const bosonApiKey = process.env.BOSON_API_KEY
const bosonBaseUrl = 'https://api.boson.ai/v1'

app.use(cors({ origin: ['http://127.0.0.1:5173', 'http://localhost:5173'] }))
app.use(express.json({ limit: '1mb' }))

const bosonHeaders = () => ({
  Authorization: `Bearer ${bosonApiKey}`,
  'Content-Type': 'application/json',
})

app.get('/api/boson/status', async (_request, response) => {
  if (!bosonApiKey) return response.status(503).json({ configured: false, voices: [] })
  try {
    const upstream = await fetch(`${bosonBaseUrl}/audio/voices`, { headers: bosonHeaders() })
    const payload = await upstream.json() as { data?: unknown[]; error?: unknown }
    if (!upstream.ok) return response.status(upstream.status).json({ configured: true, healthy: false, error: payload.error })
    return response.json({ configured: true, healthy: true, customVoiceCount: payload.data?.length ?? 0 })
  } catch {
    return response.status(502).json({ configured: true, healthy: false, error: { message: 'Boson is currently unreachable.' } })
  }
})

app.post('/api/boson/speech', async (request, response) => {
  if (!bosonApiKey) return response.status(503).json({ error: { message: 'BOSON_API_KEY is not configured on the gateway.' } })

  const { input, voice = 'chloe', tn_language: tnLanguage } = request.body as {
    input?: unknown
    voice?: unknown
    tn_language?: unknown
  }
  if (typeof input !== 'string' || input.trim().length === 0 || input.length > 5000) {
    return response.status(400).json({ error: { message: 'Input must contain between 1 and 5,000 characters.' } })
  }
  if (typeof voice !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(voice)) {
    return response.status(400).json({ error: { message: 'Invalid voice.' } })
  }
  if (tnLanguage != null && (typeof tnLanguage !== 'string' || !/^[a-z]{2}$/.test(tnLanguage))) {
    return response.status(400).json({ error: { message: 'Normalization language must be an ISO 639-1 code.' } })
  }

  try {
    const upstream = await fetch(`${bosonBaseUrl}/audio/speech`, {
      method: 'POST',
      headers: bosonHeaders(),
      body: JSON.stringify({
        model: 'higgs-tts-3',
        input: input.trim(),
        voice,
        response_format: 'mp3',
        enable_tn: true,
        ...(tnLanguage ? { tn_language: tnLanguage } : {}),
      }),
    })

    if (!upstream.ok) {
      const error = await upstream.json().catch(() => ({ error: { message: 'Voice generation failed.' } }))
      return response.status(upstream.status).json(error)
    }

    response.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'audio/mpeg')
    response.setHeader('Cache-Control', 'no-store')
    return response.send(Buffer.from(await upstream.arrayBuffer()))
  } catch {
    return response.status(502).json({ error: { message: 'Could not reach the Boson speech service.' } })
  }
})

const clientDirectory = path.resolve('dist')
if (existsSync(clientDirectory)) {
  app.use(express.static(clientDirectory))
  app.use((_request, response) => response.sendFile(path.join(clientDirectory, 'index.html')))
}

app.listen(port, '127.0.0.1', () => {
  console.log(`OpenVoice gateway listening on http://127.0.0.1:${port}`)
})
