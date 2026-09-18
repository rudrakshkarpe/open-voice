# Realtime translation

```text
upload → Express → FFprobe → FFmpeg PCM16 / 24 kHz
                                  │
                             signal check + segmentation
                                  │
                         Higgs STT (manual audio commit)
                                  │
                         timestamped source transcript
                                  │
                 text translation → Higgs TTS → cached section
                                  │
                          SSE progress → browser player
```

The Boson credential stays in `.env.local` on the gateway. All model requests run on the server. The browser uploads once and receives transcript/progress events plus generated audio URLs.

Do not use media element capture as a transcription source: the earlier implementation started capturing before playback and set the source volume to zero, while treating session acknowledgements as successful transcription. The replacement extraction is independent of browser playback. Silence is checked before model calls; language is inferred only from substantial transcript evidence. Do not equate a single Chinese character with Mandarin or Cyrillic with Russian.

The playback hook owns play intent separately from actual playback. It pauses video when a required translated section is pending, prefetches one section ahead, and applies source-to-generated duration mapping to the audio clock. Pause, seek, source replacement, and language changes invalidate pending play operations. Caption boundaries are section-level, not word-level. Further latency work should measure time to the first transcript, translated text, first speech byte, and resumed playback separately.

API: `POST /api/media` (multipart file), `GET /api/media/:id`, `GET /api/media/:id/events` (SSE), `POST /api/media/:id/translate` (`index`, `language`), `GET /api/media/:id/source.wav`, `GET /api/media/:id/audio/:file`, `DELETE /api/media/:id`. Jobs enforce file/duration limits, subprocess and provider timeouts, bounded model concurrency, and abortable processing. One-hour expiry applies to disconnected jobs. Jobs are in memory and do not survive restart.

The tested sample now yields English transcripts for all 11 sections. Browser QA covered German and Spanish audio/captions, pause of both clocks, and restart after changing languages. Unit checks cover silence, PCM levels, contiguous segmentation, and uncertain-language rejection. This is still a hackathon pipeline: no multi-speaker diarization, background-track remix, or word-perfect subtitle alignment.
