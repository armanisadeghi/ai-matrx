# FEATURE.md — AI Tutor (`features/education/tutor`)

**Status:** `active` · **Tier:** `1` (Education Hub, project P2) · **Last updated:** `2026-08-18`

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
- `mandates.ts` — `EDU_TUTOR_MANDATES` / `TUTOR_MANDATE_KEY` (`education.tutor_message`). The
  tutor's agent resolves through this mandate live (system default → org → user binding) —
  `EducationTutorClient` pre-resolves via `useMandate` because the managed `useAgentLauncher`
  overload is agent-id-only (TODO(platform): that overload should accept a mandateKey).
- `learnerMemory.ts` — **the ONE cross-session memory assembler.** Reads the study spine
  (sessions, attempts, `item_mastery` FSRS state, streak, goals) → a `LearnerMemory` snapshot +
  a compact `summaryText`.
- `grounding.ts` — `assembleTutorGrounding()` → same-turn closed-corpus RAG passages plus the
  surface context (`learner_memory`, `study_material`, request-only
  `tutor_retrieved_evidence` [retrieved passages + seed + weak-card digest],
  `teaching_mode`, `personality_style`) **plus the
  surface `trust` envelope** (`deriveGroundingTrust` — the FALLBACK strip's envelope: real
  citations from the known sources, an honest `inferred` floor, `not_in_material` when nothing is
  loaded).
- `turnTrust.ts` — the PER-TURN structured-trust channel: `extractTurnTrust()` pulls the tutor's
  hidden `<!--MATRX_TRUST_V1 …-->` envelope out of an assistant message's raw text and coerces it
  through the canonical `coerceTrustEnvelope`; `reconcileTurnTrust` drops unknown chunk ids and
  replaces agent-authored citation details with the canonical retrieved passage. Never throws;
  null when a turn has no envelope.
- `settings.ts` — per-learner tutor prefs (Socratic/Direct + personality) on the **durable settings
  system** (`userPreferences.tutor.*`, synced across devices). Owns the tutor vocabulary (unions +
  defaults) the `userPreferences` slice type-imports, the non-React `getTutorSettings()` accessor
  (reads the store), and the one-time localStorage→durable migration. `TutorSettingsPanel` reads/
  writes via `useSetting("userPreferences.tutor.*")`.
- `lanes/` — **the generalized short-lived tutor lanes** (moved here from
  `features/flashcards/data/tutor/`, P2 build guidance "generalize, don't fork"): `helpLive`
  (`flashcards.help_live`, the in-context "help me with this card" call — threads its own
  `TrustEnvelope`), `reviewSession` (`flashcards.review_batch` end-of-session review), and
  `microCoach` (`flashcards.micro_coach` per-card tip) — all mandate-resolved (keys default from
  `FC_MANDATES`; the old `config.ts` localStorage agent-id overrides are RETIRED, bindings at
  `/agents/mandates` replace them) — plus `learnerContext` (reshapes the CURRENT session's
  in-memory state). Consumed by flashcards study surfaces (`StudyDeck`, Fast Fire) — NOT the
  conversation; these are one-shot JSON lanes.

**Reused primitive introduced here:** `features/agents/hooks/useConversationRoutePromotion.ts`
— the generic conversation-route URL promotion (registerSurface + pendingNav + persisted-gated
promote with the stale-focus guard), extracted from `ChatRoomClient`. `/chat` can adopt it.

## How grounding works (load-bearing)

The tutor is a streaming TEXT chat agent (resolved live through the `education.tutor_message`
mandate — the DB decides which agent fulfils it) with **zero user-facing variables** (so
the chat composer stays clean). Before every idle submit, the
surface runtime's awaited `beforeExecute` hook runs `retrieveGroundedPassages` against the exact
learner-owned `(source_kind, source_id)` inventory. The canonical `features/rag` streamed search
receives that list through `include_sources`; an empty list fails closed and a search failure
aborts before the composer is snapshotted, preserving the draft. Grounding is **context, not
input**: `EducationTutorClient` assembles memory + retrieved material (`grounding.ts`) and dispatches
`setContextEntries({conversationId, entries:[…]})` → the instance-context slice → `request.context`,
which is **re-sent on every turn** (including continuations), so grounding stays live for the whole
conversation and never shows in the composer. The Holder reads the request-only
`tutor_retrieved_evidence` key; unlike the similarly named surface value, that key cannot be
filtered by surface auto-context policy. Four fixed citation slots overwrite on every send (unused
slots are blank), so a narrower/empty turn cannot inherit stale coordinates. Non-empty
`tutor_grounding_citation_N` pointers stay under the platform's inline threshold and persist the
exact chunk/file/document/page coordinates on the user turn. Live optimistic
`context_snapshot` supplies them through URL promotion; after
reload, `chat.message.model_context` supplies the same pointers. Full passages remain deferred and
are never duplicated into the message row.

> **Why not variables:** passing this as agent variables rendered them as an awkward editable
> strip in the chat composer ("Study Material: Paste the student's own content here…"). Grounding
> data is context, not user input — hence context policies. (Arman, 2026-07-07.)

## Trust (P0)

The tutor is P0's honest-answer surface, now with a **real per-turn structured envelope** (the
target state the earlier grounding-derived strip was a placeholder for):

- **Per-answer (agent prompt):** cite the learner's material inline (`(from your card "…")`), and
  when the material doesn't cover a question, refuse honestly and offer general knowledge as an
  explicit choice rather than fabricate.
- **Per-turn STRUCTURED envelope (primary) — `turnTrust.ts` + `TutorTurnTrust`:** the re-authored
  tutor mandate's current Holder emits, on the final line of every markdown answer, ONE hidden
  machine-readable `TrustEnvelope` for THAT turn:
  `<!--MATRX_TRUST_V1 {"confidence":…,"groundedIn":…,"citations":[…]}-->`. An HTML comment is dropped
  by the chat markdown renderer, so it rides ALONGSIDE the prose in the same stream without
  polluting the student's view (the "structured channel alongside streamed prose" pattern).
  `extractTurnTrust()` parses the latest assistant message's raw text through the ONE canonical
  `coerceTrustEnvelope` contract. The client then accepts only citation ids present in the exact
  same-turn retrieved **chunk** result or its persisted compact coordinate ledger and restores the canonical
  title/file/document/page (plus the live retrieved excerpt when available); a fabricated id can
  never make a turn `grounded`. `EducationTutorClient` renders
  `TutorTurnTrust` flush under that
  answer via `AgentConversationColumn`'s `afterMessages` slot — `ConfidenceBadge` +
  `SourceCitations` for `grounded`/`inferred`, `RefusalNotice` for `not_in_material`. This mirrors
  how the one-shot `lanes/helpLive` agent threads its `trust` envelope, adapted to a streaming
  markdown turn. The agent is prompt-bound to never fabricate `grounded` — honest `inferred` /
  `not_in_material` beats fake citations.
- **Grounding-derived strip (`TutorTrustStrip`) — pre-answer only:** rendered only for a fresh
  conversation before its first answer. An old or malformed answer with no turn envelope gets no
  reconstructed claim; today's weak cards are not evidence for yesterday's answer. The strip shows the
  grounding-DERIVED `TrustEnvelope` (`grounding.ts#deriveGroundingTrust`) from the KNOWN sources
  (seed + weak cards), floored at `inferred`, with the `not_in_material` "answers are general
  knowledge" notice when nothing is loaded.

## Voice and inline help (reused, not rebuilt)

The full spoken round-trip is free from `AgentConversationColumn`: `AgentMicrophoneButton`
(speech → composer) for input and `StreamingSpeakerButton` (read-aloud) on assistant answers for
output. No audio code lives here — per the "reuse, never rebuild audio capture" mandate.
On `StudyDeck`, `VoiceTutorPanel` opens from **Talk it through**, starts the existing realtime
voice session and receives the current card as its seed; `AskTutorButton` uses the same card seed
for typed help and `flashcards.help_live`, whose response carries a `TrustEnvelope` and a source
chip. Live verification on 2026-08-18 started/stopped a listening session on a real card and got a
card-cited ATP explanation from the typed inline path without leaving the study page.
The realtime panel is deliberately card-grounded rather than document-RAG: it has no web tool,
the database-held voice Holder treats the exact front/back/topic/revealed block as its complete
ground truth, and unsupported questions hand the learner to the full uploaded-material tutor.

## Invariants & gotchas

- **Conversations are tagged `source_feature: "education-tutor"`** (registered in
  `source-registry.ts` + the `SourceFeature` union) — real user chats, NOT system-marked, so they
  filter into the tutor history list and nowhere else.
- **Do NOT fork a conversation store.** Tutor threads are `chat.conversation` rows via the agents
  pipeline, exactly like `/chat` — the registered `conversation` shareable type (owner
  `created_by`).
- **Grounding is retrieved before every send.** `request.context` carries both the surface-facing
  `study_material` and the request-only `tutor_retrieved_evidence`; the Holder reads only the latter.
  Compact coordinate pointers preserve the trust proof across URL promotion and reload.
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
- **2026-08-18** — **Real same-turn grounding (IC-3), reload-safe.** The tutor now inventories only the
  authenticated learner's root processed documents and calls canonical `ragSearch` with exact
  `include_sources` pairs before every send. Retrieved chunks carry stable
  `GROUNDING_PASSAGE` markers and durable file/document/page coordinates inside request-only
  `tutor_retrieved_evidence`; compact coordinate pointers persist beside the deferred passage so
  the trust envelope survives both URL promotion and reload. Empty retrieval tells the Holder to refuse; failed retrieval
  aborts before submission and preserves the draft. Per-turn trust is reconciled against the
  retrieved chunk ids, and citation chips open the shared RAG Source Inspector on the exact
  chunk/page. Live proof used `ap-world-history-guide.pdf`, chunk
  `a71539dc-9694-4dc9-8d44-0972f3e6789f`, page 14; reload retained the Grounded envelope and source
  door. An Iceland-tax challenge refused without a citation. Spanish Socratic guidance and essay
  coaching both used retrieved guide passages. Unit coverage pins sequencing, marker fidelity,
  coordinate persistence and fabricated-id refusal.
- **2026-08-18** — **Adversarial grounding hardening.** Low-confidence or unverified rerank output
  fails closed; only retrieved chunk citations can authorize `grounded`; all four durable pointer
  slots overwrite every turn; historical answers never inherit today's corpus claim; and the
  tutor manifest refuses missing-provider and send-while-running paths that cannot prepare fresh
  evidence.
- **2026-08-18** — all AI steps resolve through mandates (IC-1); UUID registry deleted.
  `agents.ts` → `mandates.ts` (`education.tutor_message`); `EducationTutorClient` gates on
  `useMandate` (unresolved mandate REFUSES with the error visible — never a fallback id);
  `lanes/config.ts` (localStorage agent-id overrides) deleted — bindings replace it; TutorHome's
  history list is scoped by the education-tutor source feature, not a hardcoded agent id.
- **2026-08-11** — **The tutor lanes stream (THE FLOATING LAW).** `helpLive` (Ask AI for help) and `reviewSession` (end-of-session review) take an optional `onConversationCreated`; `StudyDeck` floats both in the `LiveRunWindow`, so the card being studied never moves. `microCoach` stays deliberately headless — nothing waits on it, it has no loading state, and its one-line tip arrives as a toast.
- **2026-08-10** — **Surface made agent-writable (3 targets) + tutor vocabulary promoted to
  `types.ts`.** `matrx-user/education-tutor` now declares `writeTargets`: `teaching_mode` and
  `personality_style` as `entity`/`ask` writes through the SAME
  `useSetting("userPreferences.tutor.*")` path `TutorSettingsPanel` uses — each ALSO re-dispatching
  the slot via `setContextEntries`, so a style change reaches the CURRENT conversation's next turn
  instead of only the next session — and `tutor_message_draft` as a `draft`/`ask`
  `{text, mode:"replace"|"append"}` write into the composer via `setUserInputText`, the exact action
  `AgentTextarea` dispatches on every keystroke. A new `composer_draft` READ value is its twin
  (emitted imperatively inside `getScope()`, never via a selector — subscribing would re-render this
  client on every keystroke) so an agent can extend a half-typed question rather than wipe it; the
  composer draft is sacred (`input-draft-protection.ts`), which is why `append` exists at all.
  Handlers are on `EducationTutorClient`'s existing provider; each validates and THROWS. A
  READ-ONLY SHARED VIEW registers NO handlers, so an agent is offered nothing on someone else's
  conversation; the draft handler refuses while `send_blocked` is true, naming the COPPA gate.
  **NOT writable, deliberately:** `learner_memory` (a real student's accumulated record —
  destructive, not authoring), `study_material` / `grounding_seed` (assembler output and an
  immutable prop, both with no setter — a write would be clobbered by the next per-turn refresh),
  `tutor_agent_id`, the trust envelopes, and every gate/sharing value. The teaching-mode and
  personality vocabulary moved to a new dependency-free `types.ts`; `settings.ts` re-exports it so
  every existing importer is unchanged, and the surface manifest — which `pnpm check:surface-drift`
  imports from a plain tsx script — can now share the constants without dragging
  `@/lib/redux/store` in behind them. Live-verified with a real Badass Agent run (see
  `features/surfaces/FEATURE.md`).
- **2026-07-14** — **Per-turn STRUCTURED trust (target state reached).** Re-authored the tutor agent
  (`d80cc27e` → `cb268e29`, "Education AI Tutor (Structured Trust)", same model; tutor context is
  supplied per turn by the surface)
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
