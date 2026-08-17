# Voice Communication Layer — surface rollout + broker cutover

**SoR (read first):** `common-docs/systems/voice-communication-layer/FEATURE.md` · repo doc: `features/voice-agent/FEATURE.md` § Voice Communication Layer.

**Done (2026-08-17):** the primitive layer. aidream: `xai_realtime` broker audience + Mandate `voice.communicator` (seed builtin agent `…0004`, persona in DB). matrx-frontend: `features/voice-agent/relay/` (controller + question ledger client tool + `useVoiceRelaySession`), `createResponseOnTurn` on `SessionUpdatePayload`, the `relay` binding on `useXaiVoiceSession`, unit tests, `/demos/voice-relay` test surface.

## Remaining work (in order of value)

1. **Verify `/demos/voice-relay` live end-to-end** (needs a browser + mic): confirm xAI honors `turn_detection.create_response: false` (the unsolicited-response watchdog screams in console if not), the ledger tool round-trips, and delivery latency feels right. Tune `NARRATION_DELAY_MS` / cue wording against real sessions.
2. **Masterwork Scout interview voice option** — add a voice toggle to `ScoutInterviewPanel` mounting `useVoiceRelaySession` with the mandate-resolved Scout as primary (`masterwork.scout`), same `surfaceKey` so typed and spoken turns share one conversation.
3. **Vision Interview (multi-role)** — the relay's input path becomes `POST /runs/{run_id}/resume` (`resume_value.message`, `summon_role`), delivery reads per-node streams (`selectWorkflowNodeStreams` + `roleFromNodeId`) and passes `speakerRole` to `speakDelivery`. Scribe never speaks.
4. **Broker cutover** — point `features/voice-agent/transport/tokenManager.ts` at the token-broker client (`lib/api/broker/`, audience `xai_realtime`, live server-side since 2026-08-17), then delete `app/api/voice-agent/token/route.ts`. Also gives OpenAI realtime a ready credential path (`openai_realtime` audience has zero consumers today).
5. **Early delivery** (open question in the SoR): speak the brain's first coherent paragraph before stream end instead of complete-turn delivery.
6. **Naming** — "Communicator" is a working label; proposals for Arman are in the SoR § Naming (recommended: Emissary).
