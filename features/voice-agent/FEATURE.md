# FEATURE.md — `voice-agent`

**Status:** `active`
**Tier:** `1`
**Last updated:** `2026-06-11`

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
- `useAudioAmplitude('mic' | 'assistant')` — rAF → `useMotionValue<number>` for the ambient glow.
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
  - **`last_model_id` is intentionally left `null`** — that column is a UUID FK to `ai_model.id` and xAI Realtime models are not registered there. The model slug (`grok-voice-latest`) lives in `metadata.voice.model` instead.
  - `metadata.voice = {provider, model, voice_id, tools_enabled, region, preset, total_turns, total_interruptions, latency_p50_ms, latency_p95_ms}`.
  - `overrides.tools = [...]` — playground tool selections.
  - Standard `user_id` ownership + existing RLS.
- `cx_message` — one row per turn.
  - `role = 'user' | 'assistant'` — who spoke.
  - `source` is the message's INPUT mechanism, strictly enumerated by a CHECK constraint (`cx_message_source_check`) — only `'user'` and `'system'` are accepted. User voice turns use `source='user'`; assistant voice turns use `source='system'` (matches aidream's pattern for system-injected messages). The voice provenance — `'xai-realtime'` — lives in `metadata.voice.provider`, NOT in `source`. Do not pass strings like `'xai-voice'` here; they violate the constraint.
  - `content = [{type: 'text', text: <transcript>}]`.
  - `is_visible_to_model = false` on interrupted assistant turns (do not poison future context).
  - `metadata.voice = {provider, model, voice_id, turn_id, item_id, response_id?, started_at_ms, ended_at_ms, was_interrupted, audio_duration_ms?, speech_ttfb_ms?}`.

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

## Custom function tools (client-side) — supported, not yet wired

xAI's realtime agent **supports custom client-side `function` tools** (and `file_search` / `web_search` / `x_search` / `mcp`), confirmed against the [Voice Agent docs](https://docs.x.ai/developers/model-capabilities/audio/voice-agent). Today the codebase only sends server-side `web_search` / `x_search` (`ToolName`), executed by xAI with no client handling. To add a client function (e.g. the Scribe Live tab reading/writing the working document — Phase 2):

- Declare in `session.update` `tools: [{ type: "function", name, description, parameters: <JSON schema> }]`.
- On `response.function_call_arguments.done` (`{ name, arguments, call_id }`) → run it locally, then send `conversation.item.create` with `{ type: "function_call_output", call_id, output }`, then `response.create`. **Parallel calls:** resolve every `call_id` before one `response.create`.
- Protocol is OpenAI-Realtime-compatible. `xaiClient.ts`'s event dispatch must learn `response.function_call_arguments.delta/done`; `types.ts` `ToolName` widens beyond the two server tools.

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
- **xAI Realtime has no pronunciation API.** No SSML, no IPA, no lexicons, no phoneme overrides. Confirmed against the [Voice Agent docs](https://docs.x.ai/developers/model-capabilities/audio/voice-agent) and the broader [Voice docs](https://docs.x.ai/developers/model-capabilities/audio/voice). The standalone TTS endpoint has delivery tags like `[laugh]` / `<whisper>`, but those are emotion/pace tags and they do not apply to the realtime agent. The ONLY place to fix mispronounced brand names, acronyms, and product nouns is the `## Pronunciation` section of the system instructions — the agent writes its own text, TTS reads it phonetically, so we teach the agent how to spoken-render specific tokens. Pattern: "Spelled X — say it as Y". Currently covered: `Matrx → Matrix`, `AI Matrx → A.I. Matrix`, `aimatrx.com → A.I. Matrix dot com`, `matrxserver.com → Matrix server dot com`. Add new entries to `INTRO_INSTRUCTIONS` in `features/voice-agent/constants.ts` as they're discovered.

---

## Related features

- **Depends on**: `@/utils/supabase/{client,server,resolveUser}`, `@/lib/redux/hooks`, `@/components/ui/{sheet,confirm-dialog}`, `sonner`.
- **Reads schema from**: `cx_conversation`, `cx_message` (shared with `features/cx-chat` and the agents chat surface).
- **Borrowed pattern**: `lib/redux/slices/voicePadSlice.ts` (multi-instance keying), `app/api/cartesia/route.ts` (token route), `features/agents/components/messages-display/assistant/BreathingOrb.tsx` (SMIL breathing animation base).
- **Sidebar integration**: [features/agents/components/chat/ChatSidebarMenu.tsx](../agents/components/chat/ChatSidebarMenu.tsx) renders a Mic icon on the collapsed rail and a "Voice agent" mode-shortcut at the top of the expanded view. Voice transcripts are excluded from the chat history list via the new `excludeSourceFeatures` scope filter on `fetchConversationHistory` (chat scope hides `'voice-agent'`) — voice rows live in `cx_conversation` but a future voice-history surface will own their listing; rendering them in the text-chat conversation view would be incorrect.
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
- `VoiceAmbientGlow` (`features/voice-agent/components/VoiceAmbientGlow.tsx`) — Why a new component: needs a fullscreen, non-interactive radial-glow surface bound to mic+assistant amplitude MotionValues across 8 states. Considered: extending `BreathingOrb`. Rejected: `BreathingOrb` is a centered orb — exactly the "looks like a button" UX failure mode we're correcting. The ambient layer is intentionally edge-anchored (bottom = user, top = agent) so the mic button remains the only thing on the surface that invites a tap. Supersedes the v1 `VoiceVisualizer` centered-orb component (deleted 2026-05-27).
- `pcm-processor-worklet.js` (`public/`) — Why a new file: there is no existing AudioWorklet processor in the repo. Required by xAI's audio spec. Not a candidate for extension.

---

## Current work / migration state

Scaffolded for first build. No migration; this is greenfield infrastructure.
Implementation tracked in
`~/.claude/plans/let-s-get-this-planned-sequential-phoenix.md`.

---

## Change log

- `2026-06-11` — **Live intermittent capture investigation parked.** The mic-captured=0 issue persists in the Cursor-embedded browser (works in prod + standard Chrome), so it's browser-specific. Added a worklet heartbeat (`worklet: process calls=N · hasInput=B`) and a copy button to the debug panel to split the remaining diagnosis, moved the panel gate from `selectIsAdmin` → `selectIsDebugMode` (app-wide debug mode), and documented everything tried + next steps in [`docs/LIVE_INTERMITTENT_CAPTURE.md`](./docs/LIVE_INTERMITTENT_CAPTURE.md). Considered mostly working for now.
- `2026-06-11` — **Fix: mic captured=0 (no audio ever reached xAI).** The debug panel revealed `mic flow: captured=0 · sent=0 · rms=0.000` while `mic active`, `ws open`, and `streaming` were all green — i.e. the session sat in `listening` forever because the worklet never produced a single PCM frame. Root cause: the capture-only `pcm-processor` worklet has `numberOfOutputs: 0` and was only wired `source → workletNode`, leaving the capture graph with **no path to `ctx.destination`**. Chrome doesn't pull a source chain that reaches nothing, so the worklet's `process()` ran with empty inputs indefinitely. Fix in `audio/audioCapture.ts`: route the source through a `gain=0` keepalive node into `ctx.destination` (silent, no feedback) so the render thread pulls the source and feeds the worklet, and `await ctx.resume()` if the context came up suspended (more likely now that the warm shared stream returns instantly, giving the synchronous warmup resume no time to settle). Added `ctxState` to `CaptureStats` → `micCtxState` flag → new "audio ctx" line in `VoiceDebugPanel` (red when active but not `running`).
- `2026-06-10` — **Live observability + reconnection hardening + shared mic grant.** Three additions driven by "Live works sometimes / dies after idle / mobile re-prompts the mic every time":
  - **Debug bus + panel.** New `features/voice-agent/debug/voiceDebugBus.ts` — a React/Redux-free per-instance ring-buffer log + live flag snapshot (`wsOpen`, `streamingReady`, `captureActive`, `tokenPresent`, `tokenExpiresInS`, `micPermission`, start/connect/close/error counters, last close code+intent, last server-event type/age, session age). `useXaiVoiceSession` now logs every lifecycle transition (start, audio warmup, token ready, ws connecting/open, session.updated, ws close intentional-vs-network with close code, all token/mic/ws/server errors) and mirrors live flags every second. New admin-only `VoiceDebugPanel` (`components/VoiceDebugPanel.tsx`) renders it; mounted at the top of `ScribeLiveScreen` behind `selectIsAdmin`. `tokenManager` gained `expiresAt()`; `xaiClient.onClose` now forwards the WebSocket close `code`.
  - **Connection watchdog + loud recovery.** A 1s interval detects the silent-death state (status is `listening`/`thinking`/`speaking`/`interrupting` but `xaiClient.isOpen()` is false) — the exact "UI says connected but the socket is gone" cause of "works sometimes / dies after idle". On detection it dispatches a sticky error and `stop()` (which mints a fresh token), so the next mic tap reconnects cleanly. Network-close now also surfaces a `ws-connection-dropped` error instead of silently flipping to idle. Added tab-visible / network-online token re-prime (a backgrounded tab throttles the refresh timer, leaving a stale/absent token; we warm a fresh one when idle and visible).
  - **Shared mic-stream manager.** New `features/audio/micStream.ts` — one ref-counted, keepalive-warmed `getUserMedia` grant for the whole app. Both `audio/audioCapture.ts` (voice) and `features/audio/hooks/useChunkedRecordAndTranscribe.ts` (scribe recorder) now `acquireMicStream` / `releaseMicStream` instead of calling `getUserMedia` + `track.stop()` themselves. After the last holder releases, the stream stays warm for 3 min so successive recordings reuse the same OS grant — killing the per-recording mobile permission prompt. `micStreamDebug()` is surfaced in the debug panel. NOTE: this supersedes the old "not reused — different audio pipeline" note below; the two pipelines still differ (MediaRecorder vs AudioWorklet) but now share the *stream acquisition* layer only.
- `2026-06-10` — First **embedded** consumer of the voice primitives: `features/transcript-studio/components/scribe/ScribeLiveScreen.tsx` (the Scribe "Live" tab). It composes the hooks (`useVoiceAgentInstance` `playground` preset + `persist:false`, `useXaiVoiceSession`, `usePersistVoiceTranscript`) and the inner components (`VoiceAmbientGlow` / `VoiceTranscriptStream` / `VoiceStatusPill` / `VoiceListenHalo` / `VoiceMicButton` / `VoiceErrorBanner`) into an embedded layout (no full-page back-header, `h-full` not `h-dvh`) and injects a per-session working document into `instructions` via `updateConfig` on every doc change. Confirms the components/hooks are embeddable as-is; `VoiceAgentSurface` remains the full-page layout. If a third embedded surface appears, extract a shared inner `<VoiceConversationSurface>` rather than copying the compose-block again.
- `2026-05-28` — Voice agents become first-class members of the agent system. Four-step migration delivered in one branch:
  - **Step 1 — Canonical `ai_model.capabilities` shape.** New module at `features/ai-models/capabilities/` defines `{input, output, features, interaction}` as the single source of truth. Tolerant parser accepts every legacy shape (null / "" / flat array / Google booleans / OpenAI I/O / hyphenated labels / literal "[transcription]"). The audit system's flat `CapabilitiesRecord` becomes a derived projection via `toAuditRecord`. All 189 `ai_model` rows backfilled via the parser; `capabilities_pre_canonical` JSONB snapshot column kept for one release as a revert safety net.
  - **Step 2 — `ui_surface.execution_mode` + `pickRuntime` resolver.** New column on `ui_surface` (`python-stream | nextjs-stream | browser-realtime | local-runtime`, default `python-stream`). New pure resolver at `features/agents/runtime/pickRuntime.ts` decides where an agent runs given the model's interaction mode and the surface's execution mode. The launcher (`launch-agent-execution.thunk.ts`) gained an early branch that calls `resolveAgentRuntime` and hands off to `launchRealtimeSession` when the runtime resolves to `browser-realtime`. Inert by default — no surface uses `browser-realtime` until Step 4's seed lands.
  - **Step 3 — Capabilities enforcement (warn-only).** `validateMessageBlocks` runs inside `execute-instance` after `assembleRequest`, logging a `console.warn` when the user's content blocks include a modality the model doesn't accept (`input` field). `process-stream` warns when an output block's type isn't in `model.capabilities.output`. Both rejections still ship the underlying turn — warn-only in this rollout phase. A follow-up ticket will flip the gates to block.
  - **Step 4 — Voice cutover.** The locked `/chat/voice` route now runs a real `agx_agent` row (id `00000000-0000-4000-8000-000000000001`, agent_type `builtin`, is_public `true`, model_id → xai_realtime). `useVoiceAgentInstance` reads voice config from the agent record when an `agentId` is provided: `settings.voice_id`, `settings.realtime_tools`, and `messages[0].content[0].text`. The playground preset keeps the constants-based fallback for ad-hoc iteration. New `ui_surface` row `matrx-user/chat-voice` (`execution_mode=browser-realtime`) makes `pickRuntime` route realtime models to `launchRealtimeSession`. Duplicating the intro agent in the Agent Builder is now the supported path for creating a custom voice agent — no code changes required.
- `2026-05-28` — Voice UI calming pass + audio-gated transcript reveal. Four user-reported regressions fixed in one change:
  1. **Strobing glow → calm swell.** `useAudioAmplitude` now runs a two-stage envelope follower (asymmetric attack/release on the raw signal, then a second slow exponential on top). Effective time constant ≈ 800 ms — glow swells over speech onset, fades over ~1.5 s on silence, no longer strobes at audio-frame rate.
  2. **Full-screen glow → contained dome.** `VoiceAmbientGlow` is now agent-speaking-only. Radials fade fully to transparent inside the viewport (70%×45% anchored at 50%/-10% instead of 110%×78%). The 220px-inset `boxShadow` rim is gone — it was the single biggest contributor to "the whole screen is alive". Listening / requesting-mic now read as dark ambient with the halo carrying the cue.
  3. **No user-vs-agent separation → focal halo + ambient dome.** New `VoiceListenHalo` component: a warm amber halo rooted to the mic button via SMIL breath (~3.6 s) + amplitude-bound scale/opacity. Sits inside the hero section behind the button. The user-listening cue is structurally distinct from the agent-speaking cool dome descending from above.
  4. **Transcript ahead of audio → audio-gated reveal.** xAI ships transcript deltas a few hundred ms ahead of the corresponding audio bytes. Added `getTurnElapsedMs()` to `audioPlayback`, `text_reveal_index` + `text_delta_arrivals` to `VoiceTurn`, a per-turn rAF loop in `useXaiVoiceSession` that maps audio-elapsed → safe char count using a fixed `TRANSCRIPT_REVEAL_LAG_MS = 250` (in `constants.ts`). On interrupt / completion the reveal index flushes to `text.length` so the user always sees the full transcript afterward. User turns are unaffected (their text comes from STT on completed audio).
- `2026-05-27` — Pause-and-restart fix: clicking the mic to stop a session and clicking again to restart was failing with `connect-failed` ("WebSocket connection error. Check network and xAI key permissions."), and the only recovery was a full page reload. Two root causes: (1) **xAI ephemeral tokens are consumed by the WebSocket handshake** — presenting the same `client_secret` to a second `wss://api.x.ai/v1/realtime` connection within its 5-minute TTL is rejected at the transport layer with no informative close code, surfacing only as the generic `onerror`. The token manager cached the secret until TTL expiry, so every restart inside that window reused a dead secret. (2) **xaiClient event subscriptions leaked across sessions** — `start()` registered `onEvent`/`onError`/`onClose` callbacks but only unsubscribed in the error path; a clean `stop()` left them attached, so the second session ran with two stacks of handlers (duplicate transcript dispatches, doubled status flips, doubled persistence writes). Fix: added `tokenManager.invalidate()` which drops the cached token + cancels the refresh timer; `useXaiVoiceSession.stop()` now invalidates and immediately background-`prime()`s so the next start mints a fresh secret without paying the round-trip in the click path. Session subscriptions are tracked in a single ref (`sessionUnsubsRef`) and torn down in both `stop()` and at the top of `start()` as defense in depth. The error path now uses the same teardown function instead of three local unsub calls.
- `2026-05-27` — Persistence bug fix #3: `cx_message.status` has a CHECK constraint (`cx_message_status_check`) that allows only `active | condensed | summary | deleted | pending | abandoned | failed` — verified by querying the live DB. The original voice writer was passing `"completed"` / `"interrupted"`, both rejected with `23514 violates check constraint`. Now mapped to the production-aligned enum: `completed → 'active'` (matches the column default and the canonical chat writer `createCxMessage` pattern, plus 11,169 production rows confirm this is the right value for a normal turn) and `interrupted → 'abandoned'` (closest enum match for a user barge-in that cut the turn off mid-flight; `metadata.voice.was_interrupted` continues to carry the voice-specific provenance for analytics). Same class of bug as the 2026-05-26 `source` fix — keeping a single-line documented mapping inline at the callsite so the next agent sees the constraint without reading the migration log. Also bumped the inline source-constraint comment to reflect the current allow-set (`user | agent_template | system`).
- `2026-05-27` — Token-mint diagnostics: `/api/voice-agent/token` now passes xAI's actual response status + body through to the browser (`{ error, xai_status, xai_body }`) AND to a structured server log line — previously the real failure reason was logged only to `console.error` in Vercel and stripped from the response, leaving the operator with an opaque "status 502" in the inline banner. `tokenManager.ts` parses the JSON body and extracts the human-readable diagnostic. The surface toast handler in `VoiceAgentSurface.tsx` now matches both the prefixed (`token-*`) codes from background refresh failures AND the raw codes from initial-connect failures — previously initial-connect failures (the common case on first click) never fired a toast because the surface only checked for the prefixed form. Added explicit `runtime = "nodejs"` and `dynamic = "force-dynamic"` on the route, and a `maskKey` helper so logs show `xai-abc…wxyz` instead of full secrets.
- `2026-05-27` — Voice surface UX refactor: replaced the centered "blue animated circle" (`VoiceVisualizer`) with `VoiceAmbientGlow` — a fullscreen, non-interactive radial-glow layer that sits behind every other surface child. Two anchored gradients (warm amber rising from the bottom for LISTENING, cool indigo descending from the top for SPEAKING) plus a screen-rim glow that picks up the active hue and breathes with amplitude. The mic button is now the only thing on the surface that invites a tap, eliminating the recurring user confusion of "is that orb a button?". Token-service-unavailable (503 from `/api/voice-agent/token`, i.e. `XAI_API_KEY` missing on the deployment) now surfaces a dedicated "Voice agent is not configured" toast so the deployment misconfiguration is unmistakable instead of a generic error.
- `2026-05-26` — Persistence bug fix #2: `cx_message.source` has a CHECK constraint (`cx_message_source_check`) that only allows `'user'` and `'system'` — verified by live probing each candidate against the production DB. The original implementation passed `'xai-voice'` and got `23514 violates check constraint`. Now user turns use `source='user'` and assistant turns use `source='system'` (matching aidream's pattern for system-injected messages); voice provenance moved to `metadata.voice.provider`. Constants split into `PERSISTENCE_MESSAGE_SOURCE_USER` and `PERSISTENCE_MESSAGE_SOURCE_ASSISTANT` with the CHECK rationale documented inline so the next agent doesn't reintroduce the bug.
- `2026-05-26` — Added a `## Pronunciation` section to `INTRO_INSTRUCTIONS` (`features/voice-agent/constants.ts`). xAI Realtime has no pronunciation API (no SSML, lexicons, IPA, or phoneme overrides — confirmed against the official docs), so brand-name pronunciation is fixed exclusively via system-instruction substitutions. Initial entries: `Matrx → Matrix`, `AI Matrx → A.I. Matrix`, `aimatrx.com → A.I. Matrix dot com`, `Matrx Engine → Matrix Engine`, `matrxserver.com → Matrix server dot com`. New troublesome words get appended to the same section as they're discovered.
- `2026-05-26` — Sidebar integration: Mic icon on the chat sidebar's collapsed rail (with subtle divider separating it from the text-chat shortcuts above) and a "Voice agent" mode-shortcut at the top of the expanded view (above pinned agents). Voice transcripts (`source_feature='voice-agent'`) are now filtered out of the `/chat` conversation history via a new per-scope `excludeSourceFeatures` filter on `fetchConversationHistory` — voice rows can't be replayed in the text-chat view, so a future dedicated voice-history surface will own their listing.
- `2026-05-26` — Persistence bug fix: `cx_conversation.last_model_id` is a UUID FK to `ai_model.id` (xAI Realtime models are not registered there); writing the slug `'grok-voice-latest'` was producing Postgres `22P02 invalid input syntax for type uuid` from `ensureConversation`. Now intentionally left null; the slug is stored in `metadata.voice.model` for both `ensureConversation` and `finalizeConversation`.
- `2026-05-25` — End-to-end implementation shipped. Built: AudioWorklet (`public/pcm-processor-worklet.js`), capture + playback modules, chunked base64 encoder, amplitude bus, full xAI WebSocket transport with exhaustive server-event handling, token manager with pre-mint + auto-refresh, orchestrator hook (`useXaiVoiceSession`), Supabase transcript persistence (`cx_conversation` + `cx_message` reuse — no schema changes), full UI surface (breathing visualizer, mic button, transcript stream, status pill, error banner), both routes (`/chat/voice` locked intro + `/chat/voice/playground` configurable), playground settings sheet with voice picker / tool toggles / instructions editor. Browser-verified: token route mints real xAI client_secret (200 OK), page renders correctly in dark mode, click flow triggers parallel capture + WS connect, permission-denied error correctly caught + surfaced via inline banner + Sonner toast, status returns to idle for sticky-error retry. Two bugs found and fixed during verification: (1) header collided with shell's user-menu avatar — added `pr-14` clearance; (2) errors were auto-clearing on status transition before user could see them — made errors sticky in slice, explicit clear at session start in orchestrator. (Remaining for a future ticket: in-browser verification of full audio loop with a mic-granted real user — requires non-headless browser; mobile Safari testing; the §10 verification matrix items 1, 2, 3, 5, 6, 7, 8.)
- `2026-05-25` — Initial scaffold: types, constants, Redux slice + selectors, registration in `rootReducer.ts`, FEATURE.md.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to this feature, update this file's status, add flows you introduced/removed, and append to the Change log.
