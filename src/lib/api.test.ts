import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApiUrl } from './api'

test('API URLs use the backend origin, never the frontend subdirectory', () => {
  assert.equal(createApiUrl()('/api/media/123/events'), '/api/media/123/events')
  assert.equal(createApiUrl('https://voice.example.org/')('/api/media/123/audio/chunk-it-0.wav'), 'https://voice.example.org/api/media/123/audio/chunk-it-0.wav')
})
test('API configuration rejects credentials, paths and unexpected destinations', () => {
  for (const origin of ['https://example.org/openvoice', 'https://user:secret@example.org', 'javascript:alert(1)', 'https://example.org?key=123']) assert.throws(() => createApiUrl(origin))
  for (const path of ['//evil.org', '/media/video', '/api/../secret', '/api/\\evil.org']) assert.throws(() => createApiUrl()(path))
})
