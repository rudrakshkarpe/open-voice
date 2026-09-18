# Continuous video translation

```text
upload OR validated YouTube URL → yt-dlp (YouTube only)
                     ↓
             FFprobe → FFmpeg PCM16 / 24 kHz
                     ↓
           signal check + quiet-boundary sections
                     ↓
       Higgs STT → timestamped source transcript → SSE
                     ↓
       sentence grouping + context-aware translation
                     ↓
        Higgs TTS → measure duration → concise retry
                     ↓
       bounded FFmpeg atempo → continuous language WAV
                     ↓
       fully decoded Web Audio buffer + video clock
```

## Why not add LiveKit here?

The input is a recorded video, not a live call. A WebRTC transport would not fix per-section MP3 loading or duration mismatches. This version keeps Express, SSE, FFmpeg and Web Audio. LiveKit becomes useful if the product adds microphones, live rooms, remote participants or an actual streaming speech pipeline.

## Extraction and captions

The Boson credential stays on the server in `.env.local`. The browser uploads once and receives progress events and same-origin media URLs. FFmpeg extraction is independent of browser volume/playback. Quiet-boundary 4–9-second source sections use explicit audio commits for STT. Silence is checked before model calls. Language is inferred from accumulated transcript evidence, not a single character or filename.

The caption renderer makes short Unicode-aware cues within each section and selects them by the video clock. It never displays generation deltas as playback captions. Timing is approximate, not word-aligned. It follows the currently audible language, even when a different language is selected and still preparing.

## Preparation and scheduling

`server/tracks.ts` groups adjacent speech into bounded contexts (up to 20 seconds / roughly 320 source characters), retaining silent intervals. Translation gets neighboring text as context, never as extra text to speak. Each unit is synthesized and measured. If too long, one additional translation attempt uses the measured duration and previous text to request a more concise version.

FFmpeg `atempo` preserves pitch and is capped at 1.35×. Output is measured again, not blindly truncated to the deadline. If speech still needs more time, its audio window is extended with a 1.2× tempo target and that video section plays more slowly. Each unit stores source and audio start/end coordinates plus the caption end. Short speech is not artificially slowed; silence fills the remaining window. Abnormally long speech (over three times the source section) fails with a retry. This is not lip-sync, and the model can still mistranslate or produce imperfect prosody.

A global preparation queue runs one translation/TTS unit at a time. Each unit boundary re-evaluates the job's latest requested language. Monotonically increasing selection revisions prevent a delayed HTTP request from overriding a newer choice. Old-language completed units are retained; retries resume at the failed unit. Selecting Original stops scheduling further translation after the in-flight unit. Source STT is separately bounded by the two-upload concurrency limit.

When all units are ready, a single PCM WAV is assembled at the mapped audio offsets and exposed as a ready track. Its duration may exceed the source duration. SSE reports stage, completed/total units, and the count of voice-paced sections. Preparation is intentionally whole-track: no claim of first-byte audio streaming.

## Playback

`useDubPlayer` downloads and decodes a whole ready track before selecting it. It caches at most three decoded tracks; the server retains completed WAVs for the media session. One `AudioBufferSourceNode` runs across the entire timeline instead of stopping/reloading at each section. Audio stays at 1×. Video speed is the unit's source-duration/audio-duration ratio, plus at most ±2% clock correction when mapped drift exceeds 60 ms. Piecewise-linear time mapping is continuous across unit boundaries and reversible for seeking and language changes.

Current audio keeps playing while a new language prepares or downloads. Ready switches prefer a target section boundary within 1.5 source seconds, otherwise switch at the current source timeline position mapped into the target audio. Short gain ramps avoid digital clicks, but an explicit mid-sentence language change can still interrupt a word. Captions switch with the active audio. Pause, seek, waiting and source replacement stop the audio node; resumption maps the video position into the active track. Epoch checks invalidate pending video-play operations.

“Recent switches” exposes language transitions. “Playback diagnostics” exposes audio instance count and measured clock drift, useful for verifying that ordinary sentence boundaries do not create new audio starts. A new instance on pause/resume, seek or language change is expected.

## API and operational limits

- `POST /api/media`: multipart `file`.
- `POST /api/media/youtube`: JSON `{url}`. Canonicalizes recognized YouTube video URLs. Downloader runs without shell interpretation, user config, plugins, cookies or remote runtime components.
- `GET /api/media/:id` and `GET /api/media/:id/events`: job snapshot / SSE.
- `POST /api/media/:id/tracks`: JSON `{language, selection, retry?}`. `original` is a valid selection and does not synthesize.
- `GET /api/media/:id/video`: imported MP4 with range support.
- `GET /api/media/:id/source.wav`: extracted transcription input.
- `GET /api/media/:id/audio/track-<language>.wav`: completed continuous translation.
- `DELETE /api/media/:id`: abort and remove temporary job files.

Limits are 200 MB, 10 minutes, two concurrent imports/transcriptions, bounded subprocess/provider timeouts, and one-hour expiry for disconnected jobs. YouTube imports select H.264/AAC MP4 up to 720p and reject live/upcoming or access-restricted metadata. YouTube may still block downloading a public video; the app reports that and offers the upload path rather than bypassing access restrictions.

Jobs are in memory and vanish on server restart. Refresh and re-upload/re-import after a backend restart. Keep `yt-dlp` updated if YouTube changes its site. The loopback-only demo has no login or quotas; internet deployment needs authentication, per-user quotas, a durable worker queue, bounded storage, and media-fetch isolation.

## Verification

`npm test` covers signal checks, segmentation, language evidence, progressive captions, timing/grouping, PCM assembly, unsafe duration rejection, YouTube URL validation and bounded switch/clock correction. `npm run lint` and `npm run build` check both TypeScript applications. Live provider and browser checks are necessary as well: API credentials, YouTube availability, provider timing and perceived speech quality cannot be guaranteed by unit tests.

Live checks on 2026-09-18 used the supplied sample and a 20-second excerpt:

- Both full `youtube.com/watch` and short `youtu.be` inputs imported the 360×640 video, detected English and produced all 11 source sections. Imported video supports byte-range seeking.
- Italian and Mandarin Chinese generated playable continuous tracks. The full 73.909-second source produced a 76.759-second Italian track with six translation units; one unit paced the video at about 0.82×. Maximum offline speech tempo was about 1.31×.
- Browser checks covered continuous playback across sections, progressive captions, Original/Italian/Chinese selection, keeping current audio during preparation, pause, rewind and cache reuse. A stale selection revision was rejected by the API. Progress reconnected correctly after frontend hot reload.
- All 23 automated tests, lint and production build passed. These are integration/timing checks, not native-speaker translation or perceived-voice-quality evaluations. Other videos, devices and provider responses still need broader testing.
