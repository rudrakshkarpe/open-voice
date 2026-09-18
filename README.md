# OpenVoice

Upload a video, verify its detected speech, and select a language for translated captions and voice.

## Run

```bash
npm install
cp .env.example .env.local
# Add the server-side BOSON_API_KEY to .env.local
npm run dev
```

Requires Node.js 22+ and FFmpeg / ffprobe on PATH (`brew install ffmpeg` on macOS). Open `http://127.0.0.1:5173`. Upload a browser-playable MP4, MOV, WebM, MP3, or WAV, or use the bundled sample. The demo accepts up to 200 MB and 10 minutes per file.

## How it works

1. Express receives the upload. FFprobe checks duration, dimensions, and the audio track.
2. FFmpeg extracts 24 kHz mono PCM independently of the video's volume or playback. Signal levels reject silent tracks. “Check extracted audio” plays the exact transcription input.
3. Quiet-boundary sections (4–9 seconds) go to Higgs STT via server-side WebSocket sessions using explicit commits. Each section retains its source timestamps. No transcription is synthesized from a filename or a character's script.
4. Accumulated transcript evidence estimates the source language; short or ambiguous text remains unidentified. Progress and transcript sections arrive through SSE while the rest of the clip processes.
5. Choose a language under **Translate to**, then click **Translate & play** to hear it. This translates the current and next section from the verified source text; Higgs TTS generates a cached MP3 for each section. You can also switch languages during playback.
6. Playback waits when a section is unavailable. Captions appear in short phrases as the video clock advances, stay still on pause, and reset on rewind. The full transcript is available separately in the expandable transcript panel. Phrase timestamps are estimated within each source section, not word-aligned by the provider. Translated audio is time-stretched to the section, with video slowed for extreme duration differences. Pause and seek affect both media clocks. Language changes stop the previous voice immediately.

Translation is **buffered, phrase-level playback**, not zero-latency sample streaming or lip synchronization. Initial generation and uncached language switches can pause playback. TTS requests are serialized and retry provider rate limits. Background music is not preserved in the translated track. The source-language estimate is transcript-based, not an acoustic confidence score; code-switching and short clips can remain ambiguous.

The original key is never committed or sent to the browser. See [the realtime design](docs/ARCHITECTURE.md).

## Verification

```bash
npm run build
npm run lint
npm test
```

Only process media you are authorized to use. YouTube page URLs are not ingested directly; upload a local media file that you have the right to translate.

Uploads and extracted audio live under an OS temporary directory, not Git. Replacing a file cancels its job. Disconnected sessions expire after one hour; development-server restarts invalidate open sessions, so re-upload after a backend restart. This server binds to loopback for local development; public hosting needs authentication and per-user quotas.
