# FEATURE.md — AI Tutor (`features/education/tutor`)

**Status:** `active` · **Tier:** `1` (Education Hub, project P2) · **Last updated:** `2026-07-07`

> The platform's #1 stated differentiator (VISION §4): "a personal tutor, not a chatbot."
> A persistent, memory-carrying, RAG-grounded conversational tutor present at every study
> surface. Source of truth for WHAT: `app/(core)/education/VISION-education-hub.md` §4.

---

## What it is

One conversational tutor, grounded in the learner's OWN material, that remembers across
sessions and is honest about the boundary of what it knows. It is NOT a new chat store — it is
the canonical `/chat` agent-execution + conversation infra, education-skinned, plus the one thing
that makes it a tutor: **grounding injection**.

## Entry points

**Routes** (`app/(core)/education/tutor/`)
- `page.tsx` → `TutorHome` — the list-first home (start a session / resume past ones), per the
  education doctrine (entry pages are LIST views).
- `new/page.tsx` → `EducationTutorClient` (fresh) — mints a grounded conversation, promotes the
  URL to `/education/tutor/[conversationId]` after the first message.
- `[conversationId]/page.tsx` → `EducationTutorClient` (existing) — resume a transcript.

**Components** (`features/education/tutor/components/`)
- `EducationTutorClient.tsx` — the conversation surface. Composes `useAgentLauncher` +
  `AgentConversationColumn` (the same primitives `/chat` uses) + grounding injection + the
  reusable `useConversationRoutePromotion`. Two mount paths (fresh / existing), mirroring
  `ChatRoomClient`. `embedded` mode (own focus scope, no URL promotion) powers AskTutor panels.
- `AskTutorButton.tsx` — the shared "I'm confused / ask my tutor" entry primitive. Drop it on
  ANY surface with a `seed` (the local card/item/set); it opens the full tutor in a side panel,
  pre-loaded with that context. Consumed by flashcards `StudyDeck`.
- `TutorHome.tsx` / `TutorLanding.tsx` — list home + fresh-conversation empty state (starters).
- `TutorSettingsPanel.tsx` — the two tunable knobs (teaching mode + personality).

**Data / logic** (`features/education/tutor/`)
- `agents.ts` — `EDU_TUTOR_AGENTS` (the live tutor agent id). `DEFAULT_TUTOR_AGENT_ID`.
- `learnerMemory.ts` — **the ONE cross-session memory assembler.** Reads the study spine
  (sessions, attempts, `item_mastery` FSRS state, streak, goals) → a `LearnerMemory` snapshot +
  a compact `summaryText`.
- `grounding.ts` — `assembleTutorGrounding()` → the launch variables (`learner_memory`,
  `study_material` [seed + weak-card digest], `teaching_mode`, `personality_style`).
- `settings.ts` — persisted per-learner tutor prefs (Socratic/Direct + personality).

**Reused primitive introduced here:** `features/agents/hooks/useConversationRoutePromotion.ts`
— the generic conversation-route URL promotion (registerSurface + pendingNav + persisted-gated
promote with the stale-focus guard), extracted from `ChatRoomClient`. `/chat` can adopt it.

## How grounding works (load-bearing)

The tutor is a streaming TEXT chat agent (`d80cc27e-…`, the current live id in `agents.ts` — see
`LIVE_AGENTS.md` for the full supersession chain) with **zero user-facing variables** (so
the chat composer stays clean) and **four declared CONTEXT SLOTS**: `learner_memory`,
`study_material`, `teaching_mode`, `personality_style` (each with a `max_inline_chars` ceiling —
content ≤ that is inlined into the model's view, capped at 5000). Grounding is **context, not
input**: `EducationTutorClient` assembles memory + material (`grounding.ts`) and dispatches
`setContextEntries({conversationId, entries:[…]})` → the instance-context slice → `request.context`,
which is **re-sent on every turn** (including continuations), so grounding stays live for the whole
conversation and never shows in the composer. The agent also carries platform **data tools** and
queries the learner's notes/flashcards/quiz live when the injected material is thin.

> **Why not variables:** passing this as agent variables rendered them as an awkward editable
> strip in the chat composer ("Study Material: Paste the student's own content here…"). Grounding
> data is context, not user input — hence context slots. (Arman, 2026-07-07.)

## Trust (P0)

The tutor is P0's honest-answer surface. The agent prompt enforces: cite the learner's material
inline (`(from your card "…")`), and when the material doesn't cover a question, refuse honestly
and offer general knowledge as an explicit choice rather than fabricate. The `TutorLanding` /
`TutorHome` carry the "Cites your material" trust affordance. (Prose citations are the trust
surface for a conversation; the structured `TrustEnvelope` primitives are for item-shaped AI
output — see `features/education/trust/`.)

## Voice (reused, not rebuilt)

The full spoken round-trip is free from `AgentConversationColumn`: `AgentMicrophoneButton`
(speech → composer) for input and `StreamingSpeakerButton` (read-aloud) on assistant answers for
output. No audio code lives here — per the "reuse, never rebuild audio capture" mandate.

## Invariants & gotchas

- **Conversations are tagged `source_feature: "education-tutor"`** (registered in
  `source-registry.ts` + the `SourceFeature` union) — real user chats, NOT system-marked, so they
  filter into the tutor history list and nowhere else.
- **Do NOT fork a conversation store.** Tutor threads are `cx_conversation`/chat-schema rows via
  the agents pipeline, exactly like `/chat`.
- **Grounding is launch-time** (variables), not per-turn — refreshing memory mid-conversation is
  a future enhancement.
- **`learnerMemory` is the one cross-session assembler**; `features/flashcards/data/tutor/
  learnerContext.ts` only reshapes the CURRENT session — don't confuse them.

## Doctrine compliance

**Reused, not rebuilt:** `AgentConversationColumn`, `useAgentLauncher`, `launchAgentExecution`,
`ConversationHistorySidebar`, `setUserVariableValues`, the study-spine `studyService`, the voice
primitives, the P0 trust affordances, the agent-execution + chat-schema conversation storage.
**Introduced:** `useConversationRoutePromotion` (generic, `/chat`-adoptable), the tutor grounding
+ memory assemblers, the `education-tutor` source_feature, `AskTutorButton`.

## Open / follow-ups

- **Generalize `features/flashcards/data/tutor/` into this feature** (the one-shot help /
  micro-coach / review lanes). Deferred to avoid conflicting with the concurrently-active
  flashcards agent editing `StudyDeck.tsx`; no duplication was introduced (this feature consumes
  those lanes as-is). Coordinate before moving.
- Per-turn memory refresh; `useAccess` (P7) for shared-transcript gating; `useEntitlement` (P8)
  on the send path — wire when those contracts land in the repo.

## Change log
- **2026-07-07** — P2 shipped: authored the tutor (`46b7b357`, later superseded same-day by the
  context-slot version `d80cc27e` — see `LIVE_AGENTS.md`) + `fc_micro_coach` (`0d6c715b`)
  agents (live-verified via agent_run: grounding, cross-session memory recall, inline citations,
  Socratic); cross-session `learnerMemory` + `grounding` assemblers; the `/education/tutor`
  surface (home/new/[id]) on the canonical chat infra with launch-time grounding + the reusable
  `useConversationRoutePromotion`; `AskTutorButton` mounted in flashcards `StudyDeck`; tunable
  settings; voice via reused composer primitives. Tool flipped `live`; admin map + LIVE_AGENTS
  updated.
