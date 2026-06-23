---
name: tts-audio-system
description: >-
  Complete guide to the TTS (Text-to-Speech), STT (Speech-to-Text), and audio
  playback system. Covers Cartesia WebSocket streaming, Groq PlayAI REST TTS,
  Groq Whisper transcription, voice assistant hooks, and all speaker UI
  components. Use when working on audio features, TTS components, voice
  playback, transcription, SpeakerButton, audio API routes, Cartesia hooks,
  or any file in features/tts/, features/audio/, hooks/tts/, or app/api/audio/.
---

# TTS / Audio System

## Architecture Overview

Two independent TTS engines, one STT engine, and a voice assistant pipeline.

### TTS Engines

| Engine | Provider | Transport | Primary Hook | API Route |
|--------|----------|-----------|-------------|-----------|
| **Cartesia** | Cartesia API | WebSocket (PCM F32LE, 44.1kHz) | `useCartesiaSpeaker` | `GET /api/cartesia` |
| **Groq/PlayAI** | Groq SDK | REST → WAV blob | `useTextToSpeech` | `POST /api/audio/text-to-speech` |

### STT Engine

| Route | Provider | Auth | Max Size |
|-------|----------|------|----------|
| `POST /api/audio/transcribe` | Groq Whisper | Supabase cookie/Bearer | 4.5 MB |
| `POST /api/audio/transcribe-url` | Groq Whisper | Supabase cookie/Bearer | 100 MB (URL) |
| `POST /api/audio/log-error` | Supabase | Supabase cookie/Bearer | N/A |

### Auth

All audio API routes use `resolveUser` from `utils/supabase/resolveUser.ts` — dual-mode: Supabase session cookie OR Bearer token. Both TTS routes (`/api/cartesia`, `/api/audio/text-to-speech`) require authentication.

---

## Directory Map

```
features/tts/              ← Production TTS feature (Cartesia + Groq)
  hooks/
    useCartesiaSpeaker.ts   ← PRIMARY Cartesia hook (lazy, self-contained)
    useTextToSpeech.ts      ← Groq/PlayAI hook (REST, WAV blob)
  components/
    SpeakerButton.tsx       ← Single play/pause toggle (lazy-loads core)
    SpeakerButtonCore.tsx   ← Dynamically imported Cartesia logic
    SpeakerGroup.tsx        ← 3-button group shell (Play, Pause, Stop)
    SpeakerGroupCore.tsx    ← Dynamically imported 3-button core
    SpeakerCompactGroup.tsx ← 2-button group shell (Play/Pause, Stop)
    SpeakerCompactGroupCore.tsx
    AudioPlayerButton.tsx   ← Groq/PlayAI button (uses useTextToSpeech)
  types.ts                  ← Shared types (EnglishVoice, SpeakerVariant, etc.)

hooks/tts/                  ← Legacy/specialized hooks
  simple/
    useCartesiaControls.ts  ← Full controls (connect-on-mount, script state)
    useCartesiaWithPreferences.ts ← Redux voice prefs + connect-on-mount
    useSimpleCartesia.ts    ← Minimal Cartesia (connect-on-mount)
  useCartesia.ts            ← Legacy full-featured (direct API key, eager)
  usePlayer.ts              ← Raw PCM stream player (Web Audio API, 24kHz)
  usePlayerSafe.ts          ← Enhanced usePlayer with explicit init
  useVoiceChat.ts           ← Voice assistant pipeline (VAD + STT + AI + TTS)
  useVoiceChatCdn.ts        ← CDN variant of voice chat
  useVoiceChatWithAutoSleep.ts ← Auto-sleep extension
  useWakeWord.ts            ← Picovoice wake word detection
  useWakeWordVoiceChat.ts   ← Wake word + voice chat combined

features/audio/             ← Recording, transcription, voice selection
  hooks/                    ← Recording and transcription hooks
  components/               ← Microphone buttons, recording overlays
  services/                 ← Error logging, fallback upload
  voice/                    ← Voice selection UI, voice playground

lib/cartesia/               ← Low-level Cartesia client & types
  client.ts                 ← LEGACY: direct NEXT_PUBLIC_CARTESIA_API_KEY
  cartesia.types.ts         ← Full Cartesia type definitions
  voices.ts / voices.json   ← Voice catalog

app/api/cartesia/route.ts   ← Token endpoint (authenticated)
app/api/audio/              ← TTS + STT API routes

utils/supabase/resolveUser.ts  ← Shared auth resolution
utils/markdown-processors/parse-markdown-for-speech.ts ← MD → plain text
```

---

## Hook Selection Guide

**Adding TTS to a new component?** Use `useCartesiaSpeaker` or a Speaker* component.

| Need | Solution |
|------|----------|
| Single play/pause button | `<SpeakerButton text={content} />` |
| 3-button group (Play/Pause/Stop) | `<SpeakerGroup text={content} />` |
| 2-button group (toggle + Stop) | `<SpeakerCompactGroup text={content} />` |
| Programmatic TTS with Redux prefs | `useCartesiaSpeaker({ processMarkdown: true })` |
| Groq/PlayAI TTS (non-Cartesia) | `useTextToSpeech()` or `<AudioPlayerButton text={content} />` |
| Full voice config UI (demo/playground) | `useCartesiaControls()` or `useSimpleCartesia()` |
| Voice assistant with VAD | `useVoiceChat()` or `useVoiceChatWithAutoSleep()` |

### Why multiple hooks exist

The legacy hooks (`useCartesiaControls`, `useSimpleCartesia`, `useCartesia`) connect eagerly on mount and manage their own voice/emotion/speed state. They exist for playground and demo pages where the user needs full control over Cartesia parameters.

`useCartesiaSpeaker` is the production hook: lazy (does nothing until `speak()` is called), reads voice preferences from Redux, and has proper error handling. Always prefer it for new features.

---

## Speaker Component Contracts

All Speaker* components follow the same pattern:

1. **Thin shell** renders static disabled buttons (zero JS loaded)
2. **First click** triggers `React.lazy()` → dynamically imports Core
3. **Core** initializes `useCartesiaSpeaker` and begins playback
4. **Shape never changes** — buttons are always rendered, unavailable actions are disabled

### Props (all variants)

```typescript
interface SpeakerProps {
  text: string;           // Content to speak
  processMarkdown?: boolean; // Strip markdown (default: true)
  className?: string;     // Applied to outer container
  disabled?: boolean;     // Disable all buttons
}

// SpeakerButton also accepts:
variant?: 'glass' | 'transparent' | 'solid' | 'group';
```

### Icon System

Speaker buttons use raw SVG icons from `components/icons/tap-buttons.tsx`, NOT Lucide. Available: `PlayTapButton`, `PauseTapButton`, `StopTapButton`, `Volume2TapButton`. See [tap-buttons reference](../../../components/icons/README.md).

### Styling

Uses `TapTargetButton` / `TapTargetButtonGroup` from `removed (ssr) route group — _components/core/TapTargetButton.tsx`. Glass styling via `matrx-glass` CSS classes (globally available in `app/globals.css`).

---

## API Contracts

### GET /api/cartesia

**Auth:** Required (cookie or Bearer)
**Response:** `{ token: string }` — short-lived Cartesia access token
**Errors:** 401 (no auth), 500 (token generation failed)

### POST /api/audio/text-to-speech

**Auth:** Required (cookie or Bearer)
**Body:** `{ text: string; voice?: EnglishVoice; model?: string }`
**Response:** `audio/wav` binary (Cache-Control: 1 year)
**Limits:** text max 10,000 chars, voice must be valid PlayAI voice
**Errors:** 400 (validation), 401 (no auth), 429 (rate limit), 500

### POST /api/audio/transcribe

**Auth:** Required
**Body:** `multipart/form-data` with `file` (audio), optional `language`, `prompt`
**Response:** `{ success, text, language, duration, segments, _meta: { attempts } }`
**Limits:** 4.5 MB file size, allowed types: flac/mp3/mp4/mpeg/mpga/m4a/ogg/wav/webm
**Retries:** 3 with exponential backoff, logged to `audio_transcription_errors`

### POST /api/audio/transcribe-url

**Auth:** Required
**Body:** `{ url: string; language?; prompt? }` — URL must be on the route's allowlist (Python backend tiers + AWS S3 hostnames; signed cld_files URLs qualify)
**Response:** Same as /transcribe
**Limits:** 100 MB via Groq URL parameter

---

## Redux Voice Preferences

```typescript
// state.userPreferences.voice (Cartesia)
interface VoicePreferences {
  voice: string;    // Cartesia voice UUID
  language: string; // e.g. "en"
  speed: number;    // 0 = normal
  emotion: string;
  microphone: boolean;
  speaker: boolean;
  wakeWord: string;
}

// state.userPreferences.textToSpeech (Groq/PlayAI)
interface TextToSpeechPreferences {
  preferredVoice: GroqTtsVoice; // e.g. "Cheyenne-PlayAI"
  autoPlay: boolean;
  processMarkdown: boolean;
}
```

---

## Known Deferred Issues

These are documented design decisions, not bugs:

1. **Five Cartesia hook variants** — Consolidation into one hook requires updating ~15 consumer files. Deferred as separate effort. Use `useCartesiaSpeaker` for all new code.
2. **`lib/cartesia/client.ts` leaks API key** — Uses `NEXT_PUBLIC_CARTESIA_API_KEY`. Legacy hook `useCartesia` depends on it. Will be removed when legacy hook is consolidated.
3. **No global TTS instance management** — Multiple components can open multiple WebSocket connections. No singleton/context pattern yet.
4. **No connection health monitoring** — No heartbeat/ping. Silent WebSocket drops discovered only on next `speak()`.
5. **No playback progress for Cartesia** — Groq hook tracks duration/currentTime; Cartesia does not.
6. **No abort for in-flight TTS** — Once `speak()` is called, no cancellation mechanism.
7. **Token expiry** — Cartesia token fetched once, no refresh. If it expires mid-session, next `speak()` reconnects automatically.

---

## Adding a New Speaker Variant

1. Create `SpeakerNewVariant.tsx` (thin shell) in `features/tts/components/`
2. Create `SpeakerNewVariantCore.tsx` (default export, uses `useCartesiaSpeaker`)
3. Use `React.lazy()` in shell to import core
4. Use `TapTargetButton*` components from `components/icons/tap-buttons.tsx`
5. Export from `features/tts/components/index.ts`
6. Never hide buttons — disable unavailable actions
7. Never change component shape during state transitions

## Modifying API Routes

All audio API routes use `resolveUser` from `utils/supabase/resolveUser.ts`. When adding new routes:
1. Import and call `resolveUser(request)` first
2. Return 401 if `!user`
3. Use structured error responses with `code` field
4. For Groq routes: implement retry with exponential backoff
5. Log errors to `audio_transcription_errors` via `logTranscriptionError()`
