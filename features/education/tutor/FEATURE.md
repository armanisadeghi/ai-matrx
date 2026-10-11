# FEATURE.md — AI Tutor (`features/education/tutor`)

**Status:** `active` · **Tier:** `1` · Product: common-docs/systems/education/VISION.md.

One conversational tutor, grounded in the learner's OWN material, remembering across sessions and
honest about the edge of what it knows. Not a new chat store: the canonical `/chat` agent-execution
+ conversation infra, education-skinned, plus **grounding injection**.

## Where it lives

- Routes (`app/(core)/education/tutor/`): `page.tsx` → `TutorHome` (list-first), `new/page.tsx` and
  `[conversationId]/page.tsx` → `EducationTutorClient` (fresh mints a grounded conversation and
  promotes the URL after the first message via `useConversationRoutePromotion` from
  `@ai-matrx/chat`; existing resumes; `embedded` mode powers AskTutor panels).
- `components/` (folder is the map): `AskTutorButton` is the shared "ask my tutor" primitive — drop
  it on any surface with a `seed`; it docks in `MatrxDynamicPanelHost`, never a blocking `Sheet`.
- `mandates.ts` — `education.tutor_message`, resolved live with `useMandate`; an unresolved mandate
  REFUSES with the error visible, never a fallback agent id.
- `learnerMemory.ts` — THE one cross-session memory assembler (study spine, FSRS `item_mastery`,
  streak, goals). `lanes/learnerContext.ts` only reshapes the CURRENT session — do not confuse them.
- `grounding.ts`, `turnTrust.ts`, `settings.ts` (durable `userPreferences.tutor.*`; vocabulary in
  `types.ts`, shared with the surface manifest), `lanes/` (one-shot JSON lanes for flashcards
  surfaces: `helpLive`, `reviewSession`, `microCoach`; they stream floating except `microCoach`,
  which is headless and toasts).
- Conversations are tagged `source_feature: "education-tutor"` (real user chats, not system-marked)
  and are `chat.conversation` rows — never fork a conversation store.

## Grounding (load-bearing)

Retrieval contract: IC-3 in `common-docs/systems/education/INTEGRATION_MAP.md`. Tutor mechanics:

- Zero user-facing agent variables, so the composer stays clean. Grounding is CONTEXT, not input:
  `EducationTutorClient` dispatches `setContextEntries(...)`, re-sent on every turn.
- Before every idle send, the surface's awaited `beforeExecute` (`prepareTutorTurn`) runs
  `retrieveGroundedPassages` over the learner's exact `(source_kind, source_id)` inventory
  (`listLearnerOwnedGroundingSources` → `files.my_rag_jobs('completed')`). Empty inventory fails
  closed; a search failure aborts before the composer is snapshotted, so the draft is never lost.
  Send is never silent: the pre-send window shows "Searching your study material" and a failure
  stays in place with Retry.
- The Holder reads the request-only `tutor_retrieved_evidence` key (retrieved passages + seed +
  weak-card digest), which surface auto-context policy cannot filter. Four fixed
  `tutor_grounding_citation_N` slots overwrite every send (unused blank) so stale coordinates never
  survive; they persist chunk/file/document/page coordinates on the user turn (optimistic
  `context_snapshot` through URL promotion, `chat.message.model_context` after reload). Full passages
  stay deferred, never duplicated into the message row.

## Trust

- **Primary, per turn:** the mandate's agent emits one hidden `<!--MATRX_TRUST_V1 {...}-->` on the
  final line of every markdown answer (an HTML comment the renderer drops). `extractTurnTrust()`
  coerces it through `coerceTrustEnvelope`; `reconcileTurnTrust` keeps only citation ids present in
  the same-turn retrieved CHUNK result or the persisted compact ledger and restores canonical
  title/file/document/page, so a fabricated id can never make a turn `grounded`. Rendered by
  `TutorTurnTrust` via `afterMessages` (`ConfidenceBadge` + `SourceCitations`, `RefusalNotice` for
  `not_in_material`).
- **Fallback, pre-answer only:** `TutorTrustStrip` shows `deriveGroundingTrust` (known sources,
  floored at `inferred`; `not_in_material` notice when nothing is loaded) for a fresh conversation
  before its first answer. An old or malformed answer with no envelope gets no reconstructed claim.
- Low-confidence or unverified rerank fails closed.

## Voice and inline help

Spoken round-trip comes from `AgentConversationColumn` (`AgentMicrophoneButton`, `StreamingSpeakerButton`);
no audio code lives here. On `StudyDeck`, `VoiceTutorPanel` ("Talk it through") starts the realtime
voice session seeded with the card, deliberately card-grounded rather than document-RAG (no web tool;
unsupported questions hand off to the full tutor); `AskTutorButton` uses the same seed for typed help
via `flashcards.help_live`, whose answer carries a `TrustEnvelope` (`LiveHelpAnswerBlock`).

## Invariants

- Send is metered, view is access-gated: the composer binds `useEntitlement` (`education.tutor_message`,
  limit shown pre-action, blocked pre-send once capped; limits and enforcement live in
  `billing.capability*`, header of `features/entitlements/registry.ts`). The existing-conversation
  view binds `useAccess("conversation", id)`: a view-only sharee gets the read-only transcript; the
  owner gets `ShareButton`. Both fail open while resolving; RLS is the boundary.
- Surface `matrx-user/education-tutor` write targets: `teaching_mode` and `personality_style` (same
  `useSetting` path as `TutorSettingsPanel`, re-dispatching the slot so the current conversation
  sees it) and `tutor_message_draft` (`replace|append` into the composer; the draft is sacred, and
  it refuses while `send_blocked`). A read-only shared view registers NO handlers. NOT writable:
  `learner_memory`, `study_material`/`grounding_seed`, the trust envelopes, gate/sharing values.
  Validation: `tutorConversationAgentWrites.ts`.

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/education/STATE.md — read it before touching this feature in ANY repo.
