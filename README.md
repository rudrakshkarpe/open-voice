# OpenVoice

Deployment configuration and the free-plan operating limits are documented in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

Paste a YouTube URL or upload a video, then switch languages with progressively generated voice and playback-synchronized captions. Playback no longer waits for a whole translated track. Uses the existing Boson API; no Hugging Face deployment or GPU is needed.

## Run

```bash
npm install
cp .env.example .env.local
# Add the server-side BOSON_API_KEY to .env.local
npm run dev
```

Requires Node.js 22+ and FFmpeg / ffprobe on PATH. YouTube imports additionally require a recent [yt-dlp](https://github.com/yt-dlp/yt-dlp). On macOS:

```bash
brew install ffmpeg yt-dlp
```

Open `http://127.0.0.1:5173`. Paste a public YouTube video, Shorts, or youtu.be link, upload a browser-playable MP4, MOV, WebM, MP3, or WAV, or use the bundled sample. Limits: 200 MB and 10 minutes. YouTube imports use a browser-compatible H.264 MP4 up to 720p; availability depends on YouTube and the formats it serves. Live, upcoming, private, age-restricted and sign-in-required videos are not supported. No browser cookies or credentials are imported; use an authorized local file if a URL cannot be fetched.

The entry screen puts the link field, file picker and limits together. Its multilingual headline has a pause control and honors reduced-motion preferences. In the player, choose **Listen in** once: preparation and switching happen automatically while the current audio continues. There is no second translation play button or whole-track progress bar. The CC button toggles captions. **New video** stops playback, cancels the current session and returns to importing. Actual interruptions and retryable errors still have a concise visible status.

## How it works

1. Express receives the upload, or yt-dlp fetches the YouTube video into a temporary directory. FFprobe checks duration, dimensions, and the audio track. Portrait and landscape videos keep their native aspect ratio.
2. FFmpeg extracts 24 kHz mono PCM independently of the video's volume or playback. Signal levels reject silent tracks. Developer diagnostics can play the exact transcription input.
3. Quiet-boundary sections (4–9 seconds) go to Higgs STT via server-side WebSocket sessions using explicit commits. Each section retains its source timestamps. No transcription is synthesized from a filename or a character's script.
4. Accumulated transcript evidence estimates the source language; short or ambiguous text remains unidentified. Progress and transcript sections arrive through SSE while the rest of the clip processes.
5. Choose **Italian**, **Mandarin Chinese**, or another target under **Listen in**. Translation starts when a source section is ready, without waiting for the remaining transcript. Neighboring text is context for natural phrasing. Each 4–9-second source section produces its own immutable WAV, published immediately. FFmpeg performs bounded, pitch-preserving tempo adjustment (at most 1.35×); longer speech paces the video more slowly instead of cutting words. Abnormally long output fails with a retry.
6. The browser switches as soon as there is a short decoded buffer at the current playback position (normally at least two seconds), not when progress reaches 100%. The existing audio continues during that first-phrase delay. Caching stays in the background. The server prioritizes the current position and upcoming sections, then backfills earlier sections; seeking and language changes update that priority. Completed sections are reused.
7. Upcoming PCM sections are decoded ahead and scheduled back-to-back on the Web Audio clock, avoiding per-sentence audio-element reloads. If the provider falls behind, video and voice pause together with a short status message, then automatically resume when enough audio arrives. Up to 48 decoded sections stay cached in the browser. Pause, seek, source replacement and language changes cancel scheduled audio. Open `http://127.0.0.1:5173/?debug=1` before importing to reveal developer diagnostics: recent switches, buffered seconds, stream starts, rebuffer events, clock drift and extracted audio.
8. Captions follow the **active** audio, not the language still preparing. They appear in short phrases as the video clock advances, stay still on pause, and reset on rewind. The full source transcript is in developer diagnostics. Phrase timings are estimated within source sections, not provider word alignment.

This is **progressive, phrase-level streaming**, not zero-latency sample-by-sample speech conversion or lip synchronization. The first source phrase still needs translation, synthesis and decoding. Generation can lag behind playback or hit provider rate limits; smooth playback is not guaranteed under those conditions. There is no whole-video preparation gate. Translation/TTS work is serialized across jobs, with TTS rate-limit retries. Provider quality varies by language. Background music is not preserved, and there is no speaker cloning or diarization. Source-language detection is transcript-based, not an acoustic confidence score.

The original key is never committed or sent to the browser. See [the playback architecture](docs/ARCHITECTURE.md).

## Verification

```bash
npm run build
npm run lint
npm test
```

Only process media you are authorized to use. YouTube URLs are restricted to recognized video links; arbitrary URLs, playlists, embedded credentials and additional downloader arguments are rejected.

Uploads and extracted audio live under an OS temporary directory, not Git. Replacing a file cancels its job. Disconnected sessions expire after one hour; development-server restarts invalidate open sessions, so re-upload after a backend restart. Local development binds to loopback; the production container listens on its service port. The public demo has shared resource/request limits but no user authentication. See the deployment guide before exposing it or uploading sensitive media.
