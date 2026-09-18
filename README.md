# OpenVoice

Paste a YouTube URL or upload a video, then prepare a language for continuous translated voice and playback-synchronized captions. Uses the existing Boson API; no Hugging Face deployment or GPU is needed.

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

## How it works

1. Express receives the upload, or yt-dlp fetches the YouTube video into a temporary directory. FFprobe checks duration, dimensions, and the audio track. Portrait and landscape videos keep their native aspect ratio.
2. FFmpeg extracts 24 kHz mono PCM independently of the video's volume or playback. Signal levels reject silent tracks. “Check extracted audio” plays the exact transcription input.
3. Quiet-boundary sections (4–9 seconds) go to Higgs STT via server-side WebSocket sessions using explicit commits. Each section retains its source timestamps. No transcription is synthesized from a filename or a character's script.
4. Accumulated transcript evidence estimates the source language; short or ambiguous text remains unidentified. Progress and transcript sections arrive through SSE while the rest of the clip processes.
5. Choose **Italian**, **Mandarin Chinese**, or another target under **Translate to**. Related source sections are grouped for more consistent TTS delivery. Translation uses adjacent text as context and measured speech duration to request more concise wording when needed. FFmpeg performs bounded, pitch-preserving tempo adjustment (at most 1.35×). If a phrase still cannot fit, its video section plays more slowly while the voice continues; words are never cut to meet a deadline. Silence pads shorter speech. Abnormally long provider output fails with a retry.
6. The server assembles one continuous WAV per language before exposing it as ready. The browser fully downloads and decodes it before switching: no network request or audio-element reload is needed at each sentence boundary. Preparation progress is visible. The dropdown stays usable and the current language continues playing while another prepares. Selecting a different language prioritizes it after the current section finishes; completed work is reused.
7. Up to three decoded language tracks stay cached in the browser. A ready track switches at a nearby section boundary (up to 1.5 source seconds ahead), otherwise at the current position, with short gain ramps to avoid clicks. Audio runs continuously at 1×; video follows the per-section voice timing with small drift corrections. Pause, seek and restart map both clocks correctly. Recent switches and playback diagnostics are expandable in the sidebar.
8. Captions follow the **active** audio, not the language still preparing. They appear in short phrases as the video clock advances, stay still on pause, and reset on rewind. The full transcript is available separately. Phrase timings are estimated within source sections, not provider word alignment.

This is **prepare-then-play dubbing**, not zero-latency speech-to-speech streaming or lip synchronization. Each new language needs an upfront wait for the entire clip; this deliberately trades first-play latency for uninterrupted playback. The original/current audio stays available during that wait. Translation/TTS work is serialized across jobs, with TTS rate-limit retries. Longer clips and additional languages can take minutes to prepare. Provider quality still varies by language; adding filler words or speaker tags is not used as a synchronization fix. Background music is not preserved, and there is no speaker cloning or diarization. Source-language detection is transcript-based, not an acoustic confidence score.

The original key is never committed or sent to the browser. See [the playback architecture](docs/ARCHITECTURE.md).

## Verification

```bash
npm run build
npm run lint
npm test
```

Only process media you are authorized to use. YouTube URLs are restricted to recognized video links; arbitrary URLs, playlists, embedded credentials and additional downloader arguments are rejected.

Uploads and extracted audio live under an OS temporary directory, not Git. Replacing a file cancels its job. Disconnected sessions expire after one hour; development-server restarts invalidate open sessions, so re-upload after a backend restart. This server binds to loopback for local development; public hosting needs authentication and per-user quotas.
