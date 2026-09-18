# OpenVoice

OpenVoice is a demo-first realtime voice switcher for AI media. It turns a single audio or video stream into a live performance surface where the listener can move between voice profiles without restarting playback.

The current hackathon build includes:

- the supplied 74-second vertical video as a ready-to-run demo;
- five audible Web Audio profiles with smooth, click-free parameter ramps;
- a realtime spectrum visualizer and animated voice-aware theme;
- switch markers written onto the playback timeline;
- local media replacement for testing another audio or video file;
- drag-and-drop support for arbitrary browser-playable audio and video;
- authenticated Higgs TTS 3 previews with language, voice, and delivery controls;
- clearly labelled seams for LiveKit transport.

## Run it

```bash
npm install
cp .env.example .env.local # or create .env.local manually
npm run dev
```

Replace `BOSON_API_KEY` in `.env.local` with your server-side Boson key. The file is ignored by Git. Do not use a `VITE_` prefix for secrets because Vite exposes those values to the browser.

Open `http://localhost:5173`. Drop any browser-playable audio/video onto the source panel or press **Replace media**. Use **Live FX** for immediate processing or **Higgs TTS** for a generated voice preview.

```bash
npm run build
npm run lint
```

## Demo mode versus generative mode

The browser demo is intentionally resilient: its Web Audio graph performs real, immediate tonal transformations without a network request. These profiles are not presented as neural voice cloning.

Higgs automatically detects the language from the script across its 102 supported languages. The UI also exposes common ISO language codes for short and mixed-language text, where normalization detection is less reliable.

The production path for replacing an entire video's speech sends phrase-aligned audio through a voice gateway:

1. LiveKit or direct WebRTC transports microphone or media audio.
2. Voice activity detection cuts it at natural boundaries.
3. Speech-to-text produces phrase text when the chosen provider needs it.
4. Higgs streams generated speech in the selected, consented voice.
5. The gateway crossfades the returned stream into the room.

See [the architecture guide](docs/ARCHITECTURE.md) for the provider contract, latency budget, and build order.

## Pitch

> OpenVoice is a programmable voice layer for live AI. One SDK lets an agent, game, or stream change vocal identity without rebuilding its audio pipeline.

## Responsible voice use

Only clone or transform a person's voice with explicit permission. A production deployment should store consent provenance alongside every custom voice, visibly identify synthetic output, and provide revocation and deletion controls. Check the Higgs model and API terms before commercial use.
