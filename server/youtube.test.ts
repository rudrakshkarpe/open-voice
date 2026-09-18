import assert from 'node:assert/strict'
import test from 'node:test'
import { youtubeUrl, validateYoutubeInfo, youtubeFailure } from './youtube.js'

test('YouTube inputs are canonicalized, with playlist and tracking arguments removed', () => {
  const expected = 'https://www.youtube.com/watch?v=fZph862_m5M'
  for (const url of ['https://youtu.be/fZph862_m5M?si=tracking', 'https://www.youtube.com/watch?v=fZph862_m5M&list=abc&t=5', 'https://m.youtube.com/shorts/fZph862_m5M', 'https://youtube.com/embed/fZph862_m5M']) assert.equal(youtubeUrl(url), expected)
})
test('both reported Shorts URLs are supported', () => {
  for (const id of ['fZph862_m5M', 'HnGxcShWNv4']) assert.equal(youtubeUrl(`https://www.youtube.com/shorts/${id}`), `https://www.youtube.com/watch?v=${id}`)
})
test('YouTube errors distinguish upstream rate limits, access checks, timeout and app limits', () => {
  const upstream = (stderr: string) => Object.assign(new Error('Command failed'), { stderr })
  assert.match(youtubeFailure(upstream('HTTP Error 429: Too Many Requests')).message, /YouTube is temporarily rate-limiting/)
  assert.match(youtubeFailure(upstream('Sign in to confirm you’re not a bot')).message, /bot check/)
  assert.match(youtubeFailure(upstream('Private video')).message, /requires sign-in/)
  assert.match(youtubeFailure(upstream('Requested format is not available')).message, /supported by the demo/)
  assert.match(youtubeFailure(Object.assign(new Error('timed out'), { killed: true })).message, /too long/)
  const duration = new Error('Choose a YouTube clip between 1 second and 10 minutes.')
  assert.equal(youtubeFailure(duration), duration)
})
test('YouTube importer rejects arbitrary destinations, credentials, shell input and playlists', () => {
  for (const url of ['http://127.0.0.1/watch?v=fZph862_m5M', 'https://youtube.com.evil.com/watch?v=fZph862_m5M', 'https://youtube.com@evil.com/watch?v=fZph862_m5M', 'https://a:secret@youtube.com/watch?v=fZph862_m5M', 'file:///etc/passwd', '--exec=bad', 'https://youtube.com/playlist?list=abc', 'https://youtu.be/fZph862_m5M/extra', 'https://youtube.com:444/watch?v=fZph862_m5M', null]) assert.throws(() => youtubeUrl(url))
})
test('YouTube duration, live and access restrictions are checked before downloading', () => {
  validateYoutubeInfo({ duration: 74, availability: 'public' })
  for (const info of [{ duration: 601 }, { duration: 0 }, {}, { duration: 30, is_live: true }, { duration: 30, live_status: 'is_upcoming' }, { duration: 30, availability: 'private' }]) assert.throws(() => validateYoutubeInfo(info))
})
