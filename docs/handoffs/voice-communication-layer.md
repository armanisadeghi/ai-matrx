# Voice Communication Layer — THE surface rollout checklist + remaining primitives

**SoR (read first):** `common-docs/systems/voice-communication-layer/FEATURE.md` — including
§ "Arman's rulings — 2026-08-17" and § "The Fast Twin pattern". Repo doc:
`features/voice-agent/FEATURE.md` § Voice Communication Layer.

**Done (2026-08-17):** the primitive layer AND the first real surface. aidream:
`xai_realtime` broker audience + Mandate `voice.communicator` (builtin agent `…0004`,
persona v2 in DB: pacing modes, coming-up preview, reflective mirroring, side-path
interrupts). matrx-frontend: `features/voice-agent/relay/` (controller + question ledger +
`sideChannel.ts` `<voice_exchange>` block + `QuestionPacing` config + `useVoiceRelaySession`
+ generic `VoiceRelayBar`), `/demos/voice-relay`, and **voice on the Masterwork Scout
interview** (`ScoutInterviewPanel` — same conversation as typed turns, pacing
`one_at_a_time`).

## 🚨 THE DURABLE SURFACE CHECKLIST (Arman, 2026-08-17: "maintain a list of ALL of them —
## we don't forget them"). Ship a row → collapse it to one Done line; NEVER delete unshipped rows.

1. **Live E2E verification** — Scout voice bar + `/demos/voice-relay` with a real mic:
   `create_response:false` honored (console screams `[voice-relay] unsolicited-response`
   if not), ledger round-trip, mirroring quality, latency; tune `NARRATION_DELAY_MS`.
2. **Vision Interview (six roles + Scribe)** — relay input becomes
   `POST /runs/{run_id}/resume` (`resume_value.message` + `summon_role`); delivery reads
   per-node streams (`selectWorkflowNodeStreams` + `roleFromNodeId`) with `speakerRole`
   attribution; Scribe never speaks.
3. **Window-panel add-on (ruling 2a)** — a `WindowPanel` hosting `VoiceRelayBar`-class
   controls bindable to ANY open conversation surface, so voice layers onto a surface
   without the surface changing (`window-panels` skill; overlay opener + catalogue entry).
4. **Showcase home (ruling 2b)** — a route where the layer shows off every integrated
   surface (lists them, hosts them). Grow it as rows above ship.
5. **Pacing user control (ruling 3)** — the surface default exists in code
   (`questionPacing`); build the user-visible control (settings-system) so the user sees
   and changes the mode; a grouped-pacing exemplar surface (travel-agent-style intake).
6. **Broker cutover** — point `transport/tokenManager.ts` at `lib/api/broker/`
   (`xai_realtime` audience, live server-side), then DELETE `app/api/voice-agent/token`.
7. **Side-channel interrupt detection** — the transcript structure ships with every brain
   send today; build the true-interrupt vs next-answer heuristic so the Communicator can
   handle clarifications locally (persona rule 6 already instructs it).
8. **Early/streamed delivery option (ruling 5)** — speak the first coherent portion,
   settings-driven, quality default untouched.
9. **OpenAI realtime as second Communicator provider** — ledger degrades to
   prompt-injection-only (primary-agent backstop holds); `openai_realtime` broker audience
   already live with zero consumers.
10. **The Fast Twin pattern** — dual frontier brains behind one voice (SoR § Fast Twin):
    fast twin (no tools, minimal thinking, concise) speaks fast; deep twin does the work;
    next-turn context merge. Open problems named in the SoR.
11. **Naming ruling** — Arman wants Anchor's news-anchor metaphor but a name that suggests
    AUDIO; current top proposal **Voiceover** (SoR § Naming). On ruling: settle the
    lexicon + rename the working labels.
12. **Voice/persona choice** — default voice per surface vs one consistent Communicator
    voice (unanswered interview question; currently "ara" everywhere).
