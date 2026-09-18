/// <reference types="node" />
import assert from 'node:assert/strict'
import test from 'node:test'
import { captionAt, captionCues } from './captions'

const text = 'Wait, is it really me talking to you right now, or is it just my clone? Well, the truth is.'

test('captions advance in short phrases, not an entire transcription section', () => {
  const cues = captionCues(text, 0, 7.2)
  assert.ok(cues.length >= 4)
  assert.ok(cues.every((cue) => cue.text.length <= 38 && cue.end > cue.start))
  assert.equal(cues.map((cue) => cue.text).join(' '), text)
  assert.equal(cues[0].start, 0)
  assert.equal(cues.at(-1)?.end, 7.2)
  cues.slice(1).forEach((cue, index) => assert.equal(cues[index].end, cue.start))
})

test('upload and rewind hide captions; pause and seek use the media clock', () => {
  const cues = captionCues(text, 0, 7.2)
  assert.equal(captionAt(cues, 0), '')
  assert.equal(captionAt(cues, 0.1), cues[0].text)
  const later = cues[2]
  assert.equal(captionAt(cues, later.start), later.text)
  assert.equal(captionAt(cues, later.start), later.text)
  assert.equal(captionAt(cues, 7.2), '')
  assert.equal(captionAt(cues, -1), '')
  assert.equal(captionAt(cues, NaN), '')
})

test('empty, missing and invalid sections never produce captions', () => {
  for (const value of ['', '   ']) assert.deepEqual(captionCues(value, 0, 8), [])
  assert.deepEqual(captionCues(text, 8, 8), [])
  assert.deepEqual(captionCues(text, 8, 0), [])
  assert.deepEqual(captionCues(text, 0, Infinity), [])
  assert.equal(captionAt([], 3), '')
})

test('languages without spaces and long tokens still form short Unicode-safe cues', () => {
  for (const value of ['这是一个关于实时字幕的测试我们希望字幕能够随着视频播放逐步出现而不是一次显示整个段落。', 'कृपया वीडियो चलाएं और अपनी पसंद की भाषा में सुनें।', '👩🏽‍💻'.repeat(50), 'a'.repeat(90)]) {
    const cues = captionCues(value, 2, 12)
    assert.ok(cues.length > 1)
    assert.equal(cues.map((cue) => cue.text).join('').replace(/\s/g, ''), value.replace(/\s/g, ''))
    assert.ok(cues.every((cue) => Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(cue.text)).length <= 38))
  }
})

test('translated phrases use the same source section clock without leaking source text', () => {
  const cues = captionCues('Es una prueba de subtítulos en español que aparecen mientras se reproduce el vídeo.', 7.2, 14.7)
  assert.equal(captionAt(cues, 7.1), '')
  assert.equal(captionAt(cues, 7.2), cues[0].text)
  assert.notEqual(captionAt(cues, 10), text)
  assert.equal(captionAt(cues, 14.7), '')
})
