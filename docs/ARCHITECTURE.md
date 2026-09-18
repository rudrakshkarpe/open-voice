# Realtime architecture

The product has two execution paths behind one session contract. The local path guarantees that the demo always works. The generative path adds actual voice identity and expressive synthesis.

```text
Browser / SDK
  ├── media element ──> Web Audio graph ──> speakers       (demo fallback)
  │
  └── mic / media ──> LiveKit room ──> voice gateway
                                      ├── VAD + phrase queue
                                      ├── STT when required
                                      ├── Higgs provider
                                      └── crossfade + LiveKit output track
```

## Why LiveKit

LiveKit provides WebRTC transport, rooms, track publication, adaptive streaming, reconnection, and server-side agents. OpenVoice should own voice selection and generation while LiveKit owns realtime media delivery. That avoids building packet-loss handling and jitter buffering during a hackathon.

Start with one room per demo session:

- `source` track: the user's original microphone or uploaded media;
- `voice` track: the processed output published by the gateway;
- data messages: `voice.select`, `voice.ready`, `voice.segment`, and `voice.error`;
- only the processed track is audible to the audience.

## Provider boundary

Keep Higgs behind the gateway so the API key never reaches the browser.

```ts
type VoiceRequest = {
  sessionId: string
  segmentId: string
  text: string
  voiceId: string
  referenceAudioUrl?: string
}

interface GenerativeVoiceProvider {
  warm(voiceId: string): Promise<void>
  synthesize(request: VoiceRequest): AsyncIterable<Uint8Array>
  cancel(segmentId: string): Promise<void>
}
```

The first `HiggsProvider` implementation can call Boson's hosted, OpenAI-compatible speech endpoint. Later providers can implement the same interface without changing the UI or LiveKit room.

## Switching semantics

Voice selection is a versioned control event, not a mutation of audio already in flight.

1. The browser emits `voice.select` with an increasing revision.
2. The gateway cancels synthesis that has not started playing.
3. The new voice is warmed immediately.
4. The current phrase finishes or reaches a VAD boundary.
5. The next phrase begins with a 50–100 ms equal-power crossfade.

This makes a switch feel immediate while avoiding half-words, clicks, and reordered chunks.

## Practical latency budget

| Stage | Target |
| --- | ---: |
| Capture frame | 20–40 ms |
| Network to room | under 100 ms |
| VAD phrase boundary | 250–500 ms |
| First generated audio | provider dependent |
| Client jitter/playout | 40–100 ms |

Call the neural path “near realtime” until first-audio latency is measured on the actual event network. The local Web Audio path remains effectively immediate and is the presentation fallback.

## Integration order

1. **Boson Higgs hosted API:** highest demo value, no model deployment.
2. **LiveKit Cloud:** microphone rooms and processed output publication.
3. **Silero VAD:** phrase boundaries without waiting for a full transcription.
4. **Whisper / faster-whisper:** required for the audio → text → Higgs path.
5. **Insforge:** session metadata, voice consent records, and generated-clip URLs.
6. **Nebius or AWS GPU:** only after the hosted path works; use it for self-hosted inference.

## Gateway endpoints

```text
POST /v1/session                 create session + LiveKit token
POST /v1/session/:id/voice      select or warm a voice
POST /v1/session/:id/reference  register a consented reference clip
GET  /v1/session/:id/events     diagnostics for the demo timeline
```

The gateway can be a small FastAPI service because audio and model SDKs are strongest in Python. Keep the Vite client static and deploy it independently.

## Stage-demo fallback plan

- Load the bundled video before judging begins.
- Play and switch between Trueform, Airwave, and Hologram.
- Point to the timeline markers created by each selection.
- If hosted generation is healthy, toggle a `GENERATIVE` mode and repeat with Higgs.
- If it is not healthy, the local path still demonstrates the SDK interaction and system design.
