# Progressive video translation

```text
upload OR validated YouTube URL → yt-dlp (YouTube only)
                     ↓
             FFprobe → FFmpeg PCM16 / 24 kHz
                     ↓
           signal check + quiet-boundary sections
                     ↓
       Higgs STT → timestamped source transcript → SSE
                     ↓
       ready source section + context-aware translation
                     ↓
          Higgs TTS → measure duration → voice pacing
                     ↓
        bounded FFmpeg atempo → publish section WAV → SSE
                     ↓
          decode ahead → Web Audio schedule + video clock
```

## Why not add LiveKit here?

The input is a recorded video, not a live call. A WebRTC transport would not fix per-section MP3 loading or duration mismatches. This version keeps Express, SSE, FFmpeg and Web Audio. LiveKit becomes useful if the product adds microphones, live rooms, remote participants or an actual streaming speech pipeline.

## Extraction and captions

The Boson credential stays on the server: `.env.local` in development, runtime environment in production. The browser uploads once and receives progress events and media URLs. Local development uses Vite's same-origin API proxy; production uses the compute backend origin with CORS restricted to the website. FFmpeg extraction is independent of browser volume/playback. Quiet-boundary 4–9-second source sections use explicit audio commits for STT. Silence is checked before model calls. Language is inferred from accumulated transcript evidence, not a single character or filename.

The caption renderer makes short Unicode-aware cues within each section and selects them by the video clock. It never displays generation deltas as playback captions. Timing is approximate, not word-aligned. It follows the currently audible language, even when a different language is selected and still preparing.

## Preparation and scheduling

Source sections have stable indices and 4–9-second quiet-boundary timing. As each transcription arrives, it becomes eligible for translation immediately; neither the complete transcript nor complete translated track is a prerequisite. Translation gets available neighboring text as context, never as extra text to speak. Each unit is synthesized once and measured. The prior extra translate/synthesize pass has been removed from this latency-sensitive path; overlong speech uses voice pacing instead.

FFmpeg `atempo` preserves pitch and is capped at 1.35×. Output is measured again, not blindly truncated to the deadline. If speech needs more time, its audio window is extended with a 1.2× tempo target and that video section plays more slowly. Each unit stores its index, source start/end, local audio start/end, caption end and its own WAV URL. Short speech is not artificially slowed; silence fills the remaining window. Abnormally long speech (over three times the source section) fails with a retry. This is not lip-sync, and the model can still mistranslate or produce imperfect prosody.

A global preparation queue runs one translation/TTS unit at a time. Each unit boundary re-evaluates the latest requested language and playhead position. It prioritizes that source section, then upcoming sections, then backfills earlier missing sections. The client updates priority on language changes, seeks and periodically during playback. Monotonically increasing selection revisions prevent delayed requests from overriding newer choices. Old-language completed sections are retained; selecting Original stops further translation after the in-flight unit. All Boson stages, including source STT and TTS backoff, share a single provider-request slot. Two source-processing jobs may run concurrently; accepted imports wait in a bounded queue. Pending transcripts do not trigger a busy loop: their completion reschedules the job.

Each PCM section is padded, written completely, then published as an immutable WAV URL through SSE. It can be fetched and played while the track remains `preparing`. `ready` now means all sections have been cached, not permission to start playback. Out-of-order sections are sorted by their stable source index, so generating near a late playhead does not require synthesizing earlier speech. Source transcription failures preserve available sections and surface an error for missing speech.

## Playback

`useDubPlayer` fetches nearby sections for the requested and active languages, with four concurrent downloads at most. It keeps up to 48 decoded sections cached; the server retains all generated section WAVs for the session. A language becomes active when decoded audio covers the current position with at least two seconds of contiguous audio, or the remaining final section. A later section cannot bridge a missing earlier one. No check against whole-track `ready` gates playback.

`AudioQueue` schedules decoded sections back-to-back at exact `AudioContext` times, before the previous node ends. The UI timer does not trigger sentence playback and no media element reload is required at boundaries. The queue looks ahead up to roughly 20 seconds. Audio runs at 1×; video speed follows each section's source/audio duration ratio, with at most ±2% drift correction. Each section uses local audio coordinates, so seeks and switches work even if preceding sections have not been generated.

Current audio keeps playing while a new language prepares at the current position. Switching uses short gain ramps; an explicit mid-sentence switch can interrupt a word. If an active queue runs dry, video and audio stop together at that source boundary, show a buffering message and automatically resume after the short cushion returns. Audio is never silently skipped to a later available section. Pause, seek, video waiting, replacement and language changes cancel scheduled nodes. Epoch checks invalidate stale asynchronous play operations.

The normal player has one language selector and one set of playback controls; selecting a language is the only action needed to prepare and switch it. A concise status distinguishes non-blocking preparation, actual audio/video interruptions, errors and finished playback. Captions can be toggled off without interrupting the audio. There are no whole-track progress bars or additional translation play buttons.

Opening the app with `?debug=1` before importing exposes developer diagnostics below the player: language transitions, buffered seconds, stream starts (not the number of scheduled section nodes), rebuffer events, clock drift, extracted audio and the source transcript. A new stream on pause/resume, seek or language change is expected. Diagnostics are hidden in the normal experience, not removed from the scheduler.

The entry screen combines YouTube and file imports with the actual demo limits. Empty, oversized and unsupported files are rejected before replacing a working source. The rotating headline keeps a stable layout, is hidden from the accessibility tree in favor of a static English heading, has a pause control and stops for reduced-motion preferences. New video cancels the session, invalidates old request responses, stops scheduled audio and releases the local object URL. No provider API change is needed for this UX.

## API and operational limits

- `POST /api/media`: multipart `file`.
- `POST /api/media/youtube`: JSON `{url}`. Canonicalizes recognized YouTube video URLs. Downloader runs without shell interpretation, user config, plugins, cookies or remote runtime components.
- `GET /api/media/:id` and `GET /api/media/:id/events`: job snapshot / SSE.
- `POST /api/media/:id/tracks`: JSON `{language, selection, position, retry?}`. `original` is a valid selection and does not synthesize. Position is a bounded source-video time; stale revisions are ignored.
- `GET /api/media/:id/video`: imported MP4 with range support.
- `GET /api/media/:id/source.wav`: extracted transcription input.
- `GET /api/media/:id/audio/chunk-<language>-<index>.wav`: a completed section, available while later sections are still generating.
- `DELETE /api/media/:id`: abort and remove temporary job files.

Limits are 200 MB, 10 minutes, two source-processing jobs, eight retained sessions and bounded subprocess/provider timeouts. Disconnected jobs expire after a two-minute reconnect grace; connected tabs stay valid. Full admission capacity returns `503 SERVER_BUSY` with `Retry-After: 5`; the frontend retries that explicit rejection for up to 45 seconds. YouTube imports select H.264/AAC MP4 up to 720p and reject live/upcoming or access-restricted metadata. YouTube may still block downloading a public video; the app reports that and offers the upload path rather than bypassing access restrictions.

Jobs are in memory and vanish on server restart. Refresh and re-upload/re-import after a backend restart. Keep `yt-dlp` updated if YouTube changes its site. Local development binds to loopback; the public demo runs on InsForge Custom Compute. Production limits each video to three translated languages and shares a 300-request daily provider guard across visitors. That counter resets at UTC midnight or on restart, so it is not a billing cap. There is no login: media URLs grant access to temporary files. Authentication, durable per-user quotas, a durable worker queue and stronger media-fetch isolation are still needed beyond the hackathon demo. See [deployment and operations](DEPLOYMENT.md).

## Verification

`npm test` covers signal checks, segmentation, language evidence, progressive captions, playhead prioritization, partial transcription readiness, PCM assembly, duration handling and YouTube validation. Fake-audio-clock tests verify exact back-to-back scheduling, mapped seeks, future-node cancellation, buffer holes and underflow. `npm run lint` and `npm run build` check both TypeScript applications. Live provider and browser checks remain necessary: credentials, YouTube availability, provider latency and perceived speech quality cannot be guaranteed by unit tests.

Progressive-playback checks on 2026-09-18 used the supplied 73-second sample:

- The API exposed a playable Italian WAV at 1/11 sections while its track was still preparing. The browser played Italian at 2/11 sections.
- Choosing uncached Chinese kept Italian playing; Chinese then became active while its cache was still incomplete (observed at 7/11). Playback reached the end with zero reported audio rebuffer events in that run.
- Section duration headers, invalid playhead rejection and stale selection handling were checked against the running API. Existing YouTube importing and byte-range playback paths are unchanged.
- These are integration/timing checks, not native-speaker quality evaluations. Progressive delivery is not sample-level model streaming: each short phrase still completes translation and synthesis before publication. Slow provider responses, concurrent jobs or network delays can still cause a short initial wait or later buffering.

UX checks on the same date verified the new landing screen, headline rotation and pause control, and a 390-pixel layout with no horizontal document overflow. In the sample player, Original switched automatically to Italian without a second play action. Requesting Mandarin Chinese kept Italian playing while the new audio prepared. The caption toggle hid the overlay without pausing playback. The source remained uncropped in its native portrait ratio. The 32-test suite, lint and production build passed; the API rejected a non-YouTube import URL with HTTP 400.
