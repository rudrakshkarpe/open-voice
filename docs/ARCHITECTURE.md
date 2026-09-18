# Realtime translation

```text
video element
  │ captureStream() → PCM16 / 24 kHz
  ▼
Higgs Realtime WebSocket
  ├── higgs-stt-3.1 → source captions → local language detection
  └── interpreter instruction → translated PCM + caption deltas
                                  │
                                  ├── Web Audio playback
                                  └── caption overlay
```

The browser authenticates with a 15-minute ephemeral key minted by `POST /api/boson/realtime-secret`. The long-lived Boson key remains in `.env.local` on the gateway.

The session uses server VAD so translation happens at natural speech boundaries. Changing the language dropdown updates the active session instructions; subsequent utterances use the new language.

This is phrase-level near-realtime interpretation, not frame-perfect dubbing. Production dubbing additionally needs timestamp alignment, time stretching, speaker diarization, and background-track separation.

Boson Realtime currently uses WebSocket. LiveKit can later transport application media, but Boson's first-party LiveKit integration is still listed as upcoming.
