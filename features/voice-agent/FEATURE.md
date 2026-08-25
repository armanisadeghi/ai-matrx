# FEATURE.md — `voice-agent` (local mechanics only)

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/agents/voice/STATE.md — read it before touching this feature in ANY repo.

What this feature IS, which surfaces exist, the persistence contract, the tool wire format,
the decisions and the remaining work all live in that node home
(`STATE.md` · `DECISIONS.md` · `HANDOFF.md` · `REALTIME_TOOL_BRIDGE.md` · `PACKAGING.md`).
Below is only what an agent editing THIS directory must not get wrong.

## Map

- `hooks/` — `useXaiVoiceSession` (the orchestrator; the only hook pages mount),
  `useGoogleLiveSession`, `useAudioCapture`, `useAudioPlayback`, `useAudioAmplitude`,
  `useVoiceAgentInstance`, `usePersistVoiceTranscript`, `useRealtimeAgentConfig`.
- `transport/` — `xaiClient.ts`, `googleRealtimeClient.ts`, `tokenManager.ts`.
- `audio/` — `audioCapture.ts`, `audioPlayback.ts`. Worklet: `public/pcm-processor-worklet.js`.
- `runtime/` + `services/` — the realtime tool loop, the client-tool registry, `/ai/tools/execute`.
- `relay/` — the Communicator layer (voice as MOUTH). Its rules are STATE.md Part I.
- `state/voiceAgentSlice.ts` — multi-instance, registered as `voiceAgent` in `rootReducer.ts`.
- Routes: `app/(core)/chat/{voice,voice/playground,voice/gemini,voice/music,talk}`.
- Checks: `pnpm check:realtime-tools[:strict]`; tests `relay/relay.test.ts`,
  `runtime/realtime-tool-loop.test.ts`, `hooks/useRealtimeAgentConfig.test.ts`.

## Audio pipeline — do not "clean up" any of these

- **Create/resume both AudioContexts synchronously inside the click handler, before any
  `await`** (`warmupSync()`). Safari permanently suspends contexts created in async callbacks.
- **Keep the `source → gain(0) → ctx.destination` keepalive tap in `audioCapture.ts`**, and
  `await ctx.resume()` when suspended. The worklet is capture-only (`numberOfOutputs: 0`);
  without a path to the destination Chrome never pulls the chain and `process()` runs empty.
- **Buffer PCM captured before `session.updated` — never drop it** (cap
  `MIC_PREBUFFER_MAX_SAMPLES`), or the first 200–700 ms of speech is lost.
- **Base64-encode audio in 8 KiB chunks.** `String.fromCharCode(...new Uint8Array(buf))`
  stack-overflows on large buffers.
- **Interruption is synchronous** — stop every source, send `response.cancel`, and mark the
  turn in the same microtask as `speech_started`. No async gaps.
- **Amplitude flows through refs + rAF + `useMotionValue`, never React state.**
- **Never call `getUserMedia` here.** Use `acquireMicStream` / `releaseMicStream`
  (`features/audio/micStream.ts`) — one ref-counted app-wide grant, or mobile re-prompts.

## Session and credential

- **The realtime credential comes only from the aidream token broker** (`lib/api/broker`,
  audience `xai_realtime`). Never a repo-local route holding `XAI_API_KEY`.
- **xAI ephemeral secrets are consumed by the WebSocket handshake.** `stop()` must
  `tokenManager.invalidate()` and background-`prime()`, or restart-within-TTL fails with an
  uninformative transport error.
- **Tear down `xaiClient` subscriptions in BOTH `stop()` and the top of `start()`.** A leaked
  stack doubles transcripts, status flips, and persistence writes.
- **Never translate one provider's messages as the other's.** Gemini Live goes through the
  aidream authenticated transport and resumes sessions; xAI holds its own ephemeral socket.
- **`useVoiceAgentInstance` is mount-once, with a seed-then-update race fix.** Config changes
  go through `updateConfig` / `applyAgentConfig` — never by re-running the effect.
- **`useRealtimeAgentConfig` is the SOLE writer of `tools`**, and the tool loop sends
  **exactly one `response.create` per flush batch** (serialized, abortable on barge-in).
  `runtime/client-tool-registry.ts` falls back to the canonical ui-first-tools registry — it
  is not a voice-only fork.
- **Relay instances key on `instanceScope` (the host surface), never the agent id** — every
  relay runs the same Communicator, and two on one page collapse into one session otherwise.
- **`VOICE_INTRO_AGENT_ID` in `constants.ts` mirrors a real DB row.** Changing one without
  the other breaks the locked intro route.
- **The intro route has ZERO settings UI by design.** New configurability goes to the playground.

## Persistence (the constraints that have burned three builds)

- `cx_message.source` accepts only `'user'` / `'system'`; voice provenance goes in
  `metadata.voice.provider`. `cx_message.status` accepts only
  `active | condensed | summary | deleted | pending | abandoned | failed` — completed → `active`,
  interrupted → `abandoned`.
- `cx_conversation.last_model_id` stays `null` (UUID FK; the slug lives in `metadata.voice.model`).
- `metadata.voice.turn_id` is the idempotency key — do not change its semantics.
- Raw audio is NEVER persisted. Voice rows are excluded from the text-chat history list via
  `excludeSourceFeatures`; do not render them there.

## Pronunciation

Fix mispronounced names ONLY in the `## Pronunciation` section of `INTRO_INSTRUCTIONS`
(`constants.ts`) — "Spelled X — say it as Y". xAI Realtime has no SSML/IPA/lexicon API.
