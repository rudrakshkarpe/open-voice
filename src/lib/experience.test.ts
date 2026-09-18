import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isAudioFile, mediaLimits, playbackNotice, validateMediaFile } from './experience'

test('upload validation explains limits before replacing a working video', () => {
  assert.equal(validateMediaFile({ name: 'clip.mp4', type: 'video/mp4', size: mediaLimits.bytes }), '')
  assert.match(validateMediaFile({ name: 'clip.mp4', type: 'video/mp4', size: mediaLimits.bytes + 1 }), /over 200 MB/)
  assert.match(validateMediaFile({ name: 'clip.mp4', type: 'video/mp4', size: 0 }), /empty/)
  assert.match(validateMediaFile({ name: 'notes.txt', type: 'text/plain', size: 12 }), /audio or video/)
  assert.equal(validateMediaFile({ name: 'RECORDING.WAV', type: '', size: 12 }), '')
})

test('audio-only files get an audio player even without a browser MIME type', () => {
  assert.equal(isAudioFile({ name: 'voice.M4A', type: '' }), true)
  assert.equal(isAudioFile({ name: 'voice', type: 'audio/aac' }), true)
  assert.equal(isAudioFile({ name: 'video.webm', type: 'video/webm' }), false)
  assert.equal(isAudioFile({ name: 'video.ogg', type: 'video/ogg' }), false)
})

const playing = { phase: 'playing' as const, playing: true, activeName: 'Original audio', targetName: 'Italian', switching: true, failed: false }

test('a background language switch never asks for a second play action', () => {
  assert.deepEqual(playbackNotice(playing), { title: 'Switching to Italian…', detail: 'Original audio continues in the meantime.', busy: true })
  assert.match(playbackNotice({ ...playing, playing: false, phase: 'paused' }).detail, /automatically/)
  assert.equal(playbackNotice({ ...playing, activeName: 'Italian', switching: false }).detail, 'Playing now')
})

test('real playback interruptions and failures remain visible', () => {
  assert.match(playbackNotice({ ...playing, phase: 'waiting-audio' }).title, /Catching up/)
  assert.match(playbackNotice({ ...playing, phase: 'waiting-video' }).title, /Waiting for the video/)
  assert.equal(playbackNotice({ ...playing, failed: true }).busy, false)
  assert.match(playbackNotice({ ...playing, phase: 'finished', playing: false, switching: false }).detail, /watch again/)
  assert.equal(playbackNotice({ ...playing, phase: 'finished', playing: false }).busy, false)
})
