---
status: active
updated: 2026-08-19
repos: [matrx-frontend, aidream]
scope: feature
feature: Voice Communication Layer
vision: []
---

# Voice Communication Layer

**What this is:** A realtime voice model (the Communicator) speaks FOR the smartest agents — the mouth, never the brain — as a layer on any conversation.
**Scope:** Feature.
**Mandate:** `voice.communicator`.
**SoR:** `common-docs/systems/agents/voice/FEATURE.md`. Repo: `features/voice-agent/FEATURE.md`.

## 🚨 VISION MISSING

Arman has not written a vision for this feature. The SoR records an interview as **paraphrase**. That is not a vision. Do not invent one. Do not staff from the paraphrase. The remaining work below is the durable surface checklist he ordered ("maintain a list of ALL of them — we don't forget them"); it is not a substitute for his words.

When he writes the vision, put his words here verbatim and fill `vision:` in the frontmatter.

## Resources

- SoR: `common-docs/systems/agents/voice/FEATURE.md` (§ rulings, Fast Twin, naming).
- Relay: `features/voice-agent/relay/`.
- Demo: `/demos/voice-relay`. First real surface: Masterwork Scout interview (`ScoutInterviewPanel`).

## Remaining work

Ship a row → collapse it to one Done line. NEVER delete an unshipped row.

1. **Live E2E verification** — Scout voice bar + `/demos/voice-relay` with a real mic: `create_response:false` honored (console screams `[voice-relay] unsolicited-response` if not), ledger round-trip, mirroring quality, latency; tune `NARRATION_DELAY_MS`.
2. **Vision Interview (six roles + Scribe)** — relay input becomes `POST /runs/{run_id}/resume` (`resume_value.message` + `summon_role`); delivery reads per-node streams with `speakerRole` attribution; Scribe never speaks.
3. **Window-panel add-on** — a `WindowPanel` hosting `VoiceRelayBar`-class controls bindable to ANY open conversation surface.
4. **Showcase home** — a route that lists every integrated surface and can host each one.
5. **Pacing user control** — surface default exists (`questionPacing`); build the user-visible control; a grouped-pacing exemplar.
6. **Broker cutover** — point `transport/tokenManager.ts` at `lib/api/broker/` (`xai_realtime`), then DELETE `app/api/voice-agent/token`.
7. **Side-channel interrupt detection** — true-interrupt vs next-answer heuristic (persona rule 6 already instructs it).
8. **Early/streamed delivery option** — speak the first coherent portion, settings-driven; quality default untouched.
9. **OpenAI realtime as second Communicator provider** — `openai_realtime` audience is live with zero consumers.
10. **The Fast Twin pattern** — dual frontier brains behind one voice. Open problems named in the SoR.
11. **Naming ruling** — Arman wants Anchor's news-anchor metaphor with an AUDIO signal; top proposal **Voiceover**. On ruling: settle the lexicon.
12. **Voice/persona choice** — default voice per surface vs one consistent Communicator voice (currently "ara" everywhere).

## Done

- Primitive layer + first real surface (Scout interview) — 2026-08-17. See the SoR.

## Decisions needed

1. **The vision.** Situation: this feature has a working primitive and a 12-row checklist, and no document in Arman's words saying what he wants. Decide: write the vision, or point at the interview notes that should be treated as it.
2. **The name.** Situation: working labels are "Voice Communication Layer" / "Communicator"; the liked metaphor is news-anchor; the audio-signal proposal is Voiceover. Decide: the product name.
