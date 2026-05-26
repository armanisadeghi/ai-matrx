# FEATURE.md — `voice-agent`

**Status:** `active`
**Tier:** `1`
**Last updated:** `2026-05-25`

---

## Purpose

Production-grade two-way realtime voice agent powered by the xAI Realtime API
(`grok-voice-latest`, us-east-1). Provides one reusable platform primitive
(`features/voice-agent/`) that powers the locked **AI Matrx Introduction Agent**
at `/chat/voice` and the fully-configurable **Voice Playground** at
`/chat/voice/playground`. The same primitive will later power voice in the
standard chat surface and embedded agent apps.

---

## Entry points

**Routes**
- `app/(a)/chat/voice/page.tsx` — locked Intro Agent (voice=ara, hardcoded
  intro prompt, tools=web_search+x_search, no settings UI).
- `app/(a)/chat/voice/playground/page.tsx` — fully configurable: voice picker,
  tool toggles, instructions editor in a right-side `<Sheet>`.

**Hooks** (`features/voice-agent/hooks/`)
- `useXaiVoiceSession({instanceId, voiceId, instructions, tools, persist})` —
  the orchestrator. The only hook the pages mount.
- `useAudioCapture()` — mic + AudioWorklet + pre-connect buffer.
- `useAudioPlayback()` — gapless PCM scheduler + sub-frame interrupt.
- `useAudioAmplitude('mic' | 'assistant')` — rAF → `useMotionValue<number>` for the visualizer.
- `useVoiceAgentInstance(preset)` — per-route instance key + lifecycle.
- `usePersistVoiceTranscript(instanceId)` — subscribes to slice; writes to Supabase on `response.done`.

**Services** (`features/voice-agent/`)
- `transport/xaiClient.ts` — WebSocket lifecycle + exhaustive server-event dispatch.
- `transport/tokenManager.ts` — token pre-mint + auto-refresh (~5s pre-expiry, exponential backoff).
- `audio/audioCapture.ts` — `getUserMedia` + AudioWorklet + pre-connect buffer.
- `audio/audioPlayback.ts` — `AudioBufferSourceNode` scheduling + interruption.
- `persistence/voiceTranscriptWriter.ts` — browser → Supabase direct writes.

**API endpoints**
- `POST /api/voice-agent/token` — `resolveUser` gate → mint xAI `client_secret`
  (5-minute TTL). Returns `{value, expires_at}`. Mirrors `/api/cartesia/route.ts`.

**Redux slice**
- `features/voice-agent/state/voiceAgentSlice.ts` — multi-instance keyed by
  `instanceId` (`'intro' | 'playground'`). Registered as `voiceAgent` in
  `lib/redux/rootReducer.ts` next to `voicePad`.

---

## Data model

**Database tables** (Supabase) — reused, no schema changes for v1.

- `cx_conversation` — one row per voice session.
  - `source_app = 'chat'`, `source_feature = 'voice-agent'` — discriminator (keeps voice in same history as text chat).
  - `system_instruction` — the agent prompt.
  - `last_model_id = 'grok-voice-latest'`.
  - `metadata.voice = {provider, voice_id, tools_enabled, region, preset, total_turns, total_interruptions, latency_p50_ms, latency_p95_ms}`.
  - `overrides.tools = [...]` — playground tool selections.
  - Standard `user_id` ownership + existing RLS.
- `cx_message` — one row per turn.
  - `source = 'xai-voice'`.
  - `role = 'user' | 'assistant'`.
  - `content = [{type: 'text', text: <transcript>}]`.
  - `is_visible_to_model = false` on interrupted assistant turns (do not poison future context).
  - `metadata.voice = {turn_id, item_id, response_id?, started_at_ms, ended_at_ms, was_interrupted, audio_duration_ms?, speech_ttfb_ms?}`.

**Raw audio is never persisted.** Contractual.

**Key types** (`features/voice-agent/types.ts`)
- `VoiceId` — `'ara' | 'eve' | 'leo' | 'rex' | 'sal'`.
- `ToolName` — `'web_search' | 'x_search'`.
- `VoiceStatus` — 8-state UI status machine.
- `VoiceTurn` — slice-internal turn shape (matches the persistence schema 1:1).
- `VoiceAgentInstance` — per-instance state.

---

## Key flows

### 1. Cold-start session (page mount → first audio)

- Page mount → `useEffect(() => fetchToken(), [])` pre-mints the ephemeral token in parallel with hydration.
- User clicks mic:
  - **Sync inside click handler** (Safari requirement): `audioCapture.warmupSync()` + `audioPlayback.warmupSync()` — create/resume both AudioContexts before any `await`.
  - **Parallel**: `Promise.all([transport.openWebSocket(token), audioCapture.start()])`.
  - Mic starts buffering PCM frames the moment it's ready — **before** the WebSocket is open.
- WebSocket opens → `session.update` sent with voice/instructions/tools.
- Server responds with `session.updated` → flush the mic pre-buffer in order, then switch to live streaming. `setStatus('listening')`.

### 2. Turn lifecycle (speech_started → response.done → Supabase row)

- `input_audio_buffer.speech_started` → `appendUserTurn({turnId, startedAtMs})`. If assistant was speaking, `playback.interrupt()` + send `response.cancel` + `markTurnInterrupted` previous assistant turn.
- `conversation.item.input_audio_transcription.delta` → `updateUserTranscriptDelta`.
- `input_audio_buffer.speech_stopped` → record `_speechEndedAtMs` for latency calc; `setStatus('thinking')`.
- `response.audio.delta` → `playback.enqueue(b64)`; on first delta of the turn: `addLatencySample`, `setStatus('speaking')`.
- `response.audio_transcript.delta` → `updateAssistantTranscriptDelta`.
- `response.done` → `completeAssistantTurn`; persistence hook flushes user+assistant pair to `cx_message`; on `playback.onIdle`: `setStatus('listening')`.

### 3. Interruption

- `input_audio_buffer.speech_started` fires while assistant is mid-utterance.
- Inside the handler — synchronously:
  1. `audioPlayback.interrupt()` calls `BufferSource.stop(0)` on every queued source.
  2. Send `{type: 'response.cancel'}` to the WebSocket.
  3. Dispatch `markTurnInterrupted({turnId, endedAtMs, audioDurationMs})` for the prior assistant turn.
  4. UI: turn dims to `opacity-50`; visualizer plays the 220ms "interrupting" flash.
- Target: speech_started → all-sources-stopped < 100ms p95.

### 4. Token refresh

- Token TTL is 300s; refresh skew is 30s.
- `tokenManager` schedules a refetch at `expires_at - 30`.
- On refresh: re-mint via `POST /api/voice-agent/token`; xAI accepts the new secret on the existing connection via the next reconnect, or via a transparent re-authentication payload (the exact path will be verified during step-2 of the verification matrix).
- On failure: exponential backoff up to 5 attempts (`min(1000 * 2 ** attempt, 10000)` ms).

---

## Invariants & gotchas

- **AudioContext must be created/resumed inside the click event handler — BEFORE any `await`.** Safari permanently suspends contexts created in async callbacks.
- **PCM frames captured before `session.updated` MUST be buffered, not dropped.** Otherwise the first 200–700ms of speech is lost. Buffer is capped at ~10s (`MIC_PREBUFFER_MAX_SAMPLES`) to prevent memory issues on slow connections.
- **Base64-encoded audio uses chunked 8 KiB encoding.** `String.fromCharCode(...new Uint8Array(buf))` crashes on large buffers (spread operator stack overflow).
- **Interruption is synchronous.** All audio source stops + the `response.cancel` send happen in the same microtask as the `speech_started` handler. No async gaps.
- **Amplitude → visualizer flows through refs + rAF + `useMotionValue`, never React state.** One re-render per frame would be catastrophic.
- **`metadata.voice.turn_id` is the idempotency key.** Do NOT change its semantics; persistence relies on it for retry safety.
- **Raw audio NEVER goes to Supabase Storage.** The contract is text-transcript only.
- **The intro route has ZERO settings UI.** New configurability goes to the playground. The intro is the proof-of-craft surface.
- **`/api/voice-agent/token` is `POST` only.** Never a `GET` — keeps it out of any prefetch / cache path.
- **AudioWorklet processor file lives at `public/pcm-processor-worklet.js`.** Must be plain JS (no TS), served from the static origin so `audioWorklet.addModule('/pcm-processor-worklet.js')` resolves.

---

## Related features

- **Depends on**: `@/utils/supabase/{client,server,resolveUser}`, `@/lib/redux/hooks`, `@/components/ui/{sheet,confirm-dialog}`, `sonner`.
- **Reads schema from**: `cx_conversation`, `cx_message` (shared with `features/cx-chat` and the agents chat surface).
- **Borrowed pattern**: `lib/redux/slices/voicePadSlice.ts` (multi-instance keying), `app/api/cartesia/route.ts` (token route), `features/agents/components/messages-display/assistant/BreathingOrb.tsx` (SMIL breathing animation base).
- **Not reused** (and why):
  - `features/cx-chat/hooks/useChatPersistence.ts` — routes writes through `/api/cx-chat/*`, which violates the current "no Next.js middle tier" doctrine in CLAUDE.md. New code writes directly to Supabase.
  - `features/audio/voice/*` — Cartesia TTS voice catalog, a different concern.
  - `useSimpleRecorder` / `useChunkedRecordAndTranscribe` — both use `MediaRecorder` (webm/opus). xAI requires raw 24 kHz PCM via AudioWorklet — a fundamentally different audio pipeline.

---

## Doctrine compliance

> Required by [PRINCIPLES.md](../../PRINCIPLES.md). The artifact is disposable; the platform is the product.

**Primitives reused**
- Types: `Json` (from Supabase generated types) for `metadata` / `overrides` payloads.
- Components: `@/components/ui/sheet`, `@/components/ui/confirm-dialog`, `@/components/ui/button`, `@/components/ui/textarea`, `@/components/ui/switch` (or `toggle`), Lucide icons.
- Redux: `useAppDispatch` / `useAppSelector` from `@/lib/redux/hooks`. Slice registered next to `voicePad` in `lib/redux/rootReducer.ts`.
- Hooks: `useReducedMotion`, `useMotionValue`, `useTransform`, `motion`, `AnimatePresence` from `motion/react` (already installed v12).
- Utilities: `@/utils/route-metadata`, `@/utils/supabase/{client,server,resolveUser}`, `cn` from `@/lib/utils`, `toast` from `sonner`.

**Primitives introduced**
- `voiceAgentSlice` (`features/voice-agent/state/voiceAgentSlice.ts`) — Why a new slice: voice session state has a unique shape (per-turn idempotency for transcript persistence, multi-state status machine, telemetry rollup). Considered: `cx-chat` slices. Rejected: they model server-side conversation runs (managed by the Python backend), not a browser-direct ephemeral session.
- `useXaiVoiceSession` (`features/voice-agent/hooks/useXaiVoiceSession.ts`) — Why a new hook: orchestrates WebSocket + AudioWorklet + scheduled playback + per-frame interruption — there is no existing primitive that composes all four. Considered: `useAgentLauncher`. Rejected: targets the Python execution system, not direct realtime.
- `VoiceVisualizer` (`features/voice-agent/components/VoiceVisualizer.tsx`) — Why a new component: needs amplitude-bound transforms across 8 states with rAF-driven motion values. Considered: extending `BreathingOrb`. Rejected: `BreathingOrb` is a fixed-rate SMIL indicator, not amplitude-reactive — wrapping it would distort its purpose. The new component imports `BreathingOrb`'s SMIL trick for idle-state breathing.
- `pcm-processor-worklet.js` (`public/`) — Why a new file: there is no existing AudioWorklet processor in the repo. Required by xAI's audio spec. Not a candidate for extension.

---

## Current work / migration state

Scaffolded for first build. No migration; this is greenfield infrastructure.
Implementation tracked in
`~/.claude/plans/let-s-get-this-planned-sequential-phoenix.md`.

---

## Change log

- `2026-05-25` — End-to-end implementation shipped. Built: AudioWorklet (`public/pcm-processor-worklet.js`), capture + playback modules, chunked base64 encoder, amplitude bus, full xAI WebSocket transport with exhaustive server-event handling, token manager with pre-mint + auto-refresh, orchestrator hook (`useXaiVoiceSession`), Supabase transcript persistence (`cx_conversation` + `cx_message` reuse — no schema changes), full UI surface (breathing visualizer, mic button, transcript stream, status pill, error banner), both routes (`/chat/voice` locked intro + `/chat/voice/playground` configurable), playground settings sheet with voice picker / tool toggles / instructions editor. Browser-verified: token route mints real xAI client_secret (200 OK), page renders correctly in dark mode, click flow triggers parallel capture + WS connect, permission-denied error correctly caught + surfaced via inline banner + Sonner toast, status returns to idle for sticky-error retry. Two bugs found and fixed during verification: (1) header collided with shell's user-menu avatar — added `pr-14` clearance; (2) errors were auto-clearing on status transition before user could see them — made errors sticky in slice, explicit clear at session start in orchestrator. (Remaining for a future ticket: in-browser verification of full audio loop with a mic-granted real user — requires non-headless browser; mobile Safari testing; the §10 verification matrix items 1, 2, 3, 5, 6, 7, 8.)
- `2026-05-25` — Initial scaffold: types, constants, Redux slice + selectors, registration in `rootReducer.ts`, FEATURE.md.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to this feature, update this file's status, add flows you introduced/removed, and append to the Change log.
