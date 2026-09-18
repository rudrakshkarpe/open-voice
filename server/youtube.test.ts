import assert from 'node:assert/strict'
import test from 'node:test'
import { youtubeUrl, validateYoutubeInfo } from './youtube.js'

test('YouTube inputs are canonicalized, with playlist and tracking arguments removed', () => {
  const expected = 'https://www.youtube.com/watch?v=fZph862_m5M'
  for (const url of ['https://youtu.be/fZph862_m5M?si=tracking', 'https://www.youtube.com/watch?v=fZph862_m5M&list=abc&t=5', 'https://m.youtube.com/shorts/fZph862_m5M', 'https://youtube.com/embed/fZph862_m5M']) assert.equal(youtubeUrl(url), expected)
})
test('YouTube importer rejects arbitrary destinations, credentials, shell input and playlists', () => {
  for (const url of ['http://127.0.0.1/watch?v=fZph862_m5M', 'https://youtube.com.evil.com/watch?v=fZph862_m5M', 'https://youtube.com@evil.com/watch?v=fZph862_m5M', 'https://a:secret@youtube.com/watch?v=fZph862_m5M', 'file:///etc/passwd', '--exec=bad', 'https://youtube.com/playlist?list=abc', 'https://youtu.be/fZph862_m5M/extra', 'https://youtube.com:444/watch?v=fZph862_m5M', null]) assert.throws(() => youtubeUrl(url))
})
test('YouTube duration, live and access restrictions are checked before downloading', () => {
  validateYoutubeInfo({ duration: 74, availability: 'public' })
  for (const info of [{ duration: 601 }, { duration: 0 }, {}, { duration: 30, is_live: true }, { duration: 30, live_status: 'is_upcoming' }, { duration: 30, availability: 'private' }]) assert.throws(() => validateYoutubeInfo(info))
})
