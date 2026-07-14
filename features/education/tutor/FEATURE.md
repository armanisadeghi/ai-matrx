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
- `TutorTurnTrust.tsx` — the P0 PER-TURN structured trust surface: the real `TrustEnvelope` for the
  latest answer (`ConfidenceBadge` + `SourceCitations`, or `RefusalNotice`), mounted under the
  answer via `afterMessages`. The primary trust surface (see Trust below).
- `TutorTrustStrip.tsx` — the grounding-derived trust surface, now the FALLBACK when a turn has no
  structured envelope (see Trust below).

**Data / logic** (`features/education/tutor/`)
- `agents.ts` — `EDU_TUTOR_AGENTS` (the live tutor agent id). `DEFAULT_TUTOR_AGENT_ID`.
- `learnerMemory.ts` — **the ONE cross-session memory assembler.** Reads the study spine
  (sessions, attempts, `item_mastery` FSRS state, streak, goals) → a `LearnerMemory` snapshot +
  a compact `summaryText`.
- `grounding.ts` — `assembleTutorGrounding()` → the context slots (`learner_memory`,
  `study_material` [seed + weak-card digest], `teaching_mode`, `personality_style`) **plus the
  surface `trust` envelope** (`deriveGroundingTrust` — the FALLBACK strip's envelope: real
  citations from the known sources, an honest `inferred` floor, `not_in_material` when nothing is
  loaded).
- `turnTrust.ts` — the PER-TURN structured-trust channel: `extractTurnTrust()` pulls the tutor's
  hidden `<!--MATRX_TRUST_V1 …-->` envelope out of an assistant message's raw text and coerces it
  through the canonical `coerceTrustEnvelope`. Never throws; null when a turn has no envelope.
- `settings.ts` — per-learner tutor prefs (Socratic/Direct + personality) on the **durable settings
  system** (`userPreferences.tutor.*`, synced across devices). Owns the tutor vocabulary (unions +
  defaults) the `userPreferences` slice type-imports, the non-React `getTutorSettings()` accessor
  (reads the store), and the one-time localStorage→durable migration. `TutorSettingsPanel` reads/
  writes via `useSetting("userPreferences.tutor.*")`.
- `lanes/` — **the generalized short-lived tutor lanes** (moved here from
  `features/flashcards/data/tutor/`, P2 build guidance "generalize, don't fork"): `helpLive`
  (`fc_help_live`, the in-context "help me with this card" call — threads its own
  `TrustEnvelope`), `reviewSession` (`fc_review_batch` end-of-session review), `microCoach`
  (`fc_micro_coach` per-card tip), `learnerContext` (reshapes the CURRENT session's in-memory
  state), and `config` (per-lane agent-id overrides). Consumed by flashcards study surfaces
  (`StudyDeck`, Fast Fire) — NOT the conversation; these are one-shot JSON lanes.

**Reused primitive introduced here:** `features/agents/hooks/useConversationRoutePromotion.ts`
— the generic conversation-route URL promotion (registerSurface + pendingNav + persisted-gated
promote with the stale-focus guard), extracted from `ChatRoomClient`. `/chat` can adopt it.

## How grounding works (load-bearing)

The tutor is a streaming TEXT chat agent (`cb268e29-…`, the current live id in `agents.ts` — see
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

The tutor is P0's honest-answer surface, now with a **real per-turn structured envelope** (the
target state the earlier grounding-derived strip was a placeholder for):

- **Per-answer (agent prompt):** cite the learner's material inline (`(from your card "…")`), and
  when the material doesn't cover a question, refuse honestly and offer general knowledge as an
  explicit choice rather than fabricate.
- **Per-turn STRUCTURED envelope (primary) — `turnTrust.ts` + `TutorTurnTrust`:** the re-authored
  tutor agent (`cb268e29-…`) emits, on the final line of every markdown answer, ONE hidden
  machine-readable `TrustEnvelope` for THAT turn:
  `<!--MATRX_TRUST_V1 {"confidence":…,"groundedIn":…,"citations":[…]}-->`. An HTML comment is dropped
  by the chat markdown renderer, so it rides ALONGSIDE the prose in the same stream without
  polluting the student's view (the "structured channel alongside streamed prose" pattern).
  `extractTurnTrust()` parses the latest assistant message's raw text through the ONE canonical
  `coerceTrustEnvelope` contract; `EducationTutorClient` renders `TutorTurnTrust` flush under that
  answer via `AgentConversationColumn`'s `afterMessages` slot — `ConfidenceBadge` +
  `SourceCitations` for `grounded`/`inferred`, `RefusalNotice` for `not_in_material`. This mirrors
  how the one-shot `lanes/helpLive` agent threads its `trust` envelope, adapted to a streaming
  markdown turn. The agent is prompt-bound to never fabricate `grounded` — honest `inferred` /
  `not_in_material` beats fake citations.
- **Grounding-derived strip (`TutorTrustStrip`) — FALLBACK only:** rendered *only when the current
  turn carries no structured envelope* (fresh/empty conversation, mid-stream before the closing
  `-->` lands, or an older answer that predates the structured channel). It shows the
  grounding-DERIVED `TrustEnvelope` (`grounding.ts#deriveGroundingTrust`) from the KNOWN sources
  (seed + weak cards), floored at `inferred`, with the `not_in_material` "answers are general
  knowledge" notice when nothing is loaded.

## Voice (reused, not rebuilt)

The full spoken round-trip is free from `AgentConversationColumn`: `AgentMicrophoneButton`
(speech → composer) for input and `StreamingSpeakerButton` (read-aloud) on assistant answers for
output. No audio code lives here — per the "reuse, never rebuild audio capture" mandate.

## Invariants & gotchas

- **Conversations are tagged `source_feature: "education-tutor"`** (registered in
  `source-registry.ts` + the `SourceFeature` union) — real user chats, NOT system-marked, so they
  filter into the tutor history list and nowhere else.
- **Do NOT fork a conversation store.** Tutor threads are `chat.conversation` rows via the agents
  pipeline, exactly like `/chat` — the registered `conversation` shareable type (owner
  `created_by`).
- **Grounding is injected at launch AND refreshed per turn.** `request.context` re-sends every
  turn; after each new turn `EducationTutorClient` re-assembles memory + material and overwrites
  the `learner_memory` / `study_material` slots (a per-key MERGE — `teaching_mode` /
  `personality_style` survive), so mid-conversation studying never leaves stale memory riding
  along. Owner-only, gated on a changed message count.
- **`learnerMemory` is the one cross-session assembler**; `lanes/learnerContext.ts` only reshapes
  the CURRENT session — don't confuse them.
- **Send is metered, view is access-gated.** The composer binds `useEntitlement`
  (`education.tutor_message`) — limit shown pre-action, send blocked pre-send once capped (permissive
  today, `enforced: false`). The existing-conversation view binds `useAccess("conversation", id)` —
  a view-only sharee gets the read-only transcript (composer hidden, banner shown); the owner sees
  the live tutor + `ShareButton`. Both fail open while resolving; RLS is the real boundary.

## Doctrine compliance

**Reused, not rebuilt:** `AgentConversationColumn`, `useAgentLauncher`, `launchAgentExecution`,
`ConversationHistorySidebar`, `setUserVariableValues`, the study-spine `studyService`, the voice
primitives, the P0 trust affordances, the agent-execution + chat-schema conversation storage.
**Introduced:** `useConversationRoutePromotion` (generic, `/chat`-adoptable), the tutor grounding
+ memory assemblers, the grounding-derived `TutorTrustStrip`, the `education-tutor`
source_feature, `AskTutorButton`, the generalized `lanes/`. **Consumed contracts:** P8
`useEntitlement`, P7 `useAccess`, P0 `TrustEnvelope` + trust components.

## Open / follow-ups

- **Conversation sharing UX:** the `useAccess` view/edit gate + `ShareButton` are wired, but the
  shareable read-only transcript is only exercised once real tutor-conversation shares exist.
- **Enforcement:** `education.tutor_message` stays `enforced: false` until the aidream-side spend
  re-check lands (per `features/entitlements/FEATURE.md`).

## Change log
- **2026-07-14** — **Per-turn STRUCTURED trust (target state reached).** Re-authored the tutor agent
  (`d80cc27e` → `cb268e29`, "Education AI Tutor (Structured Trust)", same four context slots + model)
  to emit a hidden per-turn `TrustEnvelope` on the final line of every markdown answer
  (`<!--MATRX_TRUST_V1 …-->`) — mirroring how `helpLive` threads its envelope, adapted to a streaming
  turn. Added `turnTrust.ts` (`extractTurnTrust`, parses it via the canonical `coerceTrustEnvelope`)
  + `TutorTurnTrust` (real per-turn `ConfidenceBadge`+`SourceCitations` / `RefusalNotice`, rendered
  under the answer via `afterMessages`). The grounding-derived `TutorTrustStrip` is now the FALLBACK,
  shown only when a turn carries no structured envelope. Preserves cross-session memory, per-turn
  memory refresh, entitlement metering, and access gating. Backend verified (`agent_run`: honest
  `not_in_material` envelope) + live browser (grounded citation + honest refusal).
- **2026-07-10 (b)** — **Tutor settings → durable platform settings.** Moved the Socratic/Direct +
  personality prefs off per-browser localStorage onto the synced settings system
  (`userPreferences.tutor`, `features/settings`), so they follow the learner across devices.
  `settings.ts` keeps the vocabulary + a non-React store accessor + a one-time localStorage
  migration (nobody loses their current choice); the localStorage write path + the same-tab
  `education-tutor-settings-changed` event are deleted. `TutorSettingsPanel` now uses `useSetting`.
- **2026-07-10** — Closed the recorded P2 open items: metered send (`useEntitlement`,
  `education.tutor_message`, pre-visible limit + pre-send block); conversation view/edit gating
  (`useAccess("conversation", id)` — read-only sharee, owner `ShareButton`); generalized the
  flashcards tutor lanes into `lanes/` (repointed every consumer, deleted the old module, no
  shims); per-turn learner-memory refresh; and the P0 fix — a grounding-derived `TutorTrustStrip`
  (citations + confidence + refusal) on the previously trust-blind live tutor.
- **2026-07-07** — P2 shipped: authored the tutor (`46b7b357`, later superseded same-day by the
  context-slot version `d80cc27e` — see `LIVE_AGENTS.md`) + `fc_micro_coach` (`0d6c715b`)
  agents (live-verified via agent_run: grounding, cross-session memory recall, inline citations,
  Socratic); cross-session `learnerMemory` + `grounding` assemblers; the `/education/tutor`
  surface (home/new/[id]) on the canonical chat infra with launch-time grounding + the reusable
  `useConversationRoutePromotion`; `AskTutorButton` mounted in flashcards `StudyDeck`; tunable
  settings; voice via reused composer primitives. Tool flipped `live`; admin map + LIVE_AGENTS
  updated.
