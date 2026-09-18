import 'dotenv/config'
import { config } from 'dotenv'
import cors from 'cors'
import express from 'express'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { mediaRouter } from './media.js'

config({ path: '.env.local', override: true })

const app = express()
const port = Number(process.env.PORT ?? 8787)
const bosonApiKey = process.env.BOSON_API_KEY
const bosonBaseUrl = 'https://api.boson.ai/v1'

app.use(cors({ origin: ['http://127.0.0.1:5173', 'http://localhost:5173'] }))
app.use(express.json({ limit: '1mb' }))
app.use('/api/media', mediaRouter)
app.use('/api', (_request, response, next) => { response.set('Cache-Control', 'no-store'); next() })

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

app.post('/api/boson/realtime-secret', async (_request, response) => {
  if (!bosonApiKey) return response.status(503).json({ error: { message: 'BOSON_API_KEY is not configured on the gateway.' } })
  try {
    const upstream = await fetch(`${bosonBaseUrl}/realtime/client_secrets`, {
      method: 'POST',
      headers: bosonHeaders(),
      body: JSON.stringify({ expires_after: { seconds: 900 } }),
    })
    const payload = await upstream.json() as { value?: string; expires_at?: number; error?: unknown }
    if (!upstream.ok || !payload.value) return response.status(upstream.status).json({ error: payload.error ?? { message: 'Could not create a realtime session.' } })
    return response.json({ secret: payload.value, expiresAt: payload.expires_at })
  } catch {
    return response.status(502).json({ error: { message: 'Could not reach the Boson realtime service.' } })
  }
})

const clientDirectory = path.resolve('dist')
app.use('/api', (_request, response) => response.status(404).json({ error: 'API route not found.' }))
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  void _next // Express identifies an error handler by its four arguments.
  response.status(400).json({ error: error.message.includes('File too large') ? 'Use a file smaller than 200 MB.' : 'Unable to process this upload.' })
})
if (existsSync(clientDirectory)) {
  app.use(express.static(clientDirectory))
  app.use((_request, response) => response.sendFile(path.join(clientDirectory, 'index.html')))
}

app.listen(port, '127.0.0.1', () => {
  console.log(`OpenVoice gateway listening on http://127.0.0.1:${port}`)
})
