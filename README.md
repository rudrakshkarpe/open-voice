# OpenVoice

Upload a video, select a language, and hear translated speech with synchronized captions while the video plays.

## Run

```bash
npm install
cp .env.example .env.local
# Add the server-side BOSON_API_KEY to .env.local
npm run dev
```

Open `http://127.0.0.1:5173` in Chrome. Upload a browser-playable MP4, MOV, WebM, MP3, or WAV, or use the bundled sample.

## How it works

1. The server exchanges the long-lived Boson key for a short-lived browser session secret.
2. The browser streams the playing media as 24 kHz mono PCM to Higgs Realtime.
3. `higgs-stt-3.1` creates the source captions and the client identifies the spoken language.
4. Higgs follows a strict simultaneous-interpreter instruction for the selected output language.
5. Returned PCM audio and transcript deltas play as the translated voice and captions.

The original key is never committed or sent to the browser. See [the realtime design](docs/ARCHITECTURE.md).

## Verification

```bash
npm run build
npm run lint
```

Only process media you are authorized to use. YouTube page URLs are not ingested directly; upload a local media file that you have the right to translate.
