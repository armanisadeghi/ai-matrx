# Vision Interview — local mechanics for `features/vision-interview/`

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/masterwork/vision-interview/STATE.md — read it before touching this feature in ANY repo.

**Vision Interview is a Distillation Approach inside the Masterwork Domain, never a separate
product.** What it is, why it exists, the v3 three-panel design, the v2 stage machine, the six
roles, the `interview.*` truth tables, the graph orchestration, the deviations from the design
doc, the deferred tail and every naming caveat all live in that STATE.md. The backend half
(engine, workflow, service, `interview.*` tables) is aidream `aidream/services/vision_interview/`.

## Entry points

| Surface | Route / file |
|---|---|
| List page | `app/(core)/vision-interview/page.tsx` → `components/VisionInterviewListPage.tsx` (canonical entity-list shell; config `browse/listConfig.tsx`) |
| Room | `app/(core)/vision-interview/[sessionId]/page.tsx` → `components/VisionInterviewRoom.tsx` — RouteHeader + THREE resizable panels (cookie `vision-interview-room-layout-v3`): `QuestionsPanel` (~22%) · `RoomChatPane` (~50%) · `ExpertFeedPanel` (~28%); mobile switches panes (Questions · Room · Feed) |
| One expert's room | `components/RoomChatPane.tsx` — `StageTabs` + the CANONICAL `ChatRoomClient` for the active role, plus the Scribe's document/deliverables and the answer-append rider |
| Stage tabs | `components/StageTabs.tsx` — one substantial button per stage primary (icon disc + role name + stage label together) |
| **Finish (the guided run)** | `components/RoomHeader.tsx` → `components/FinishInterviewDialog.tsx` — the ONE door to the workflow run, and therefore to `interview.finalize` and the three deliverables. Starts the run, sends `done` when it hands back, shows the gate's answer, and opens each document the moment it exists |
| New interview | `components/NewInterviewDialog.tsx` (direct Supabase insert → routes into the room) |

## Data flow

## Invariants

1. **Echo suppression is timestamp-monotonic and lives IN the slice reducers**
   (`isStaleMerge`): older `updated_at` drops; equal drops only when content
   matches; unparseable degrades to delivering. Optimistic writes merge a
   locally-stamped row, then the server row; failed writes revert through the
   guard-bypassing `questionForced`/`holeForced` only.
2. **Never hand-render a stream.** Persisted markdown (turns, the living
   document) renders through `<RichDocument>`; run streams live in
   `activeRequests` (adopted + SSE-followed). No `useLiveJsonRegion`, no
   chunk bucketing in feature components.
3. **Live tokens render per node, no double-render.** While a role node
   speaks, the expert feed shows a `LiveTurnCard` off
   `selectWorkflowNodeStreams(requestId)` — accumulated markdown through
   `BasicMarkdownContent` (the collab child-stream precedent). The card
   hides the moment the persisted `interview.turn` for that role lands in
   the current round OR the node settles (`node_completed` on the feed),
   whichever arrives first. Reasoning deltas surface only as the subtle
   "Thinking" state — chain-of-thought is never transcript content.
4. **The Scribe is the only writer of `session.document`** — the document pane
   is read-only; the FE never writes `document`, `stage`, `current_round`, or
   any turn row (server/realtime-owned). FE writes: session title + soft
   delete, question `state` (defer/reopen), hole
   classification/status/resolution (reclassify keeps provenance via
   `reclassified_by_human=true`; accept-risk behind a ConfirmDialog).
5. **Stage movement is human-controlled and rides the resume payload** —
   `advance_stage` (the header's Advance control), `done` (the header's
   Finish control — the only path to finalize), and v2's `goto_stage`
   (v3: the centre panel's "Move the interview here" bar, shown when you are
   reading an expert whose stage is not the current one — ANY stage, forward
   or back). Both arm
   only while the run waits on the human (`waiting_human`); disabled states
   carry an honest tooltip, never a silent no-op. Summoning a role
   (`summon_role`) makes it the NEXT round's primary.
6. List page follows lib/entity-list + lib/list-scope: RPCs in
   `migrations/ivw_list_scoped.sql` (relevance-ranked search ported from the
   agx/trx scorer; scopes mine/orgs/shared/public; the config declares
   mine/orgs/shared).
7. **The flow can never dead-end — the composer is ALIVE in every phase.**
   Before a run: type/dictate an opening statement; Start appends it to the
   session's `vision_statement` (`service.ts::appendVisionStatement` — human
   content, the one session field beyond title the FE writes; the backend
   seeds turn 0 from it on first start and it stays as durable context for
   restarts). During a run: the textarea keeps accepting a draft, the status
   line narrates the real state, and Send arms the moment `run_interrupted`
   lands. `start`/`resume` return ACCEPTANCE (boolean) — a draft is cleared
   only on an accepted request, so failures never eat the user's text; every
   failure path lands in `runFailed`, which re-arms Start. Busy state is
   per-button; nothing global locks.
8. **One visual language for everyone in the room:** `RoleAvatar` (chart-token
   accents on `ROLES[key].accent`, human = primary, Sounding Board =
   chart-6 — added to globals.css for v2) is the ONE avatar disc —
   presence strip, persisted turns, live cards, summon menu. Turns follow the
   /chat message language (role turns plain, human turns primary-tinted
   bubble, hover copy); the living document splits the Scribe's H2 sections
   into an Accordion (string split on PERSISTED markdown — every body still
   renders through `RichDocument`, never a hand parser).
9. **Question categories are stage-keyed.** `interview.question.category`
   (core/grounding/enhancement/articulation/risk/architectural/gap; null on
   pre-v2 rows reads as `gap` via `questionCategory()`) renders as the ONE
   `QuestionCategoryChip` (Lucide icons, chart tokens). The left panel shows
   ALL questions with the current stage's category grouped first
   (`selectQuestionsGroupedForStage`) so the Expert can answer ahead of
   schedule; `selectNextQuestions` still ranks the stage-matched ones.
10. **Raw-audio capture (v2 §13.1) — never lose the speaker's audio.** Every
    composer dictation's full recording is uploaded by the SHARED recorder's
    canonical path (fileHandler via `saveAudioToStorage` — never a hand-rolled
    upload) independently of any agent call (§17.1 ordering: a failed run
    never touches the audio). The composer wraps its subtree in
    `RecordingOriginProvider` (`surface: "vision-interview.composer"`,
    `entityId` = session) so the transcripts row is attributed, and listens on
    `features/audio/dictationAudioRegistry` (generic primitive contributed by
    this feature — the recorder announces each save outcome) for the
    `cld_files` id. An ACCEPTED send/start moves the pending ids to
    `awaitingTurnAudio`; `useTurnAudioAttachment` stamps
    `interview.turn.audio_file_id` on the server-created human turn (guarded
    `IS NULL` write, robust to either arrival order; several dictations in one
    message → the LAST id is stamped, all recordings stay in transcripts). A
    failed upload keeps the blob retryable IN MEMORY (registry `retry()`;
    localStorage can't hold blobs) behind an honest composer banner; the
    IndexedDB chunk safety store still covers a crash. Playback: `TurnCard`'s
    Listen chip → `<InlineMediaRef as="audio">` (re-mints from file_id —
    never a raw `<audio src>`).
11. **Final deliverables (v2 §13.3).** `session.cleaned_transcript` /
    `vision_document` / `requirements_document` / `finalized_at` are
    server-written (finalize step in aidream). When present, the side pane
    (and the mobile switcher) grow Vision / Requirements / Transcript tabs —
    `DeliverablePane` renders each read-only through `<RichDocument>` with
    copy + markdown download (`downloadBlob`). Before finalize nothing
    renders; the existing session-row realtime subscription delivers them
    live the moment finalize lands. **Which record is on screen lives in the
    SLICE** (`docView` / `docViewChanged` / `selectDocView`, cleared by
    `activeRoleTabChanged`), not in `RoomChatPane` local state, so the finish
    dialog can OPEN a document it just told the Expert about — a document you
    are told about but cannot reach is a dead end.
12. **Failure honesty (v2 §17):** every run/start/resume error surface must
    SAY the Expert's words are safe — the draft persists on-device
    (`useDurableDraft`) and a sent message lands as a turn before agents run
    — and offer the retry in the same breath. Never lose composer content
    (acceptance-gated clearing, invariant 7). `callApi` owns capture and
    classification; its returned `{error}` is rendered with
    `toastErrorAlreadyCaptured`, never filed again as a context-free
    `user-toast` row.

13. **ONE STAGE TAB == ONE ROLE == ONE ORDINARY AGENT CONVERSATION (v3).**
    `interview.session.role_bindings` already holds, per role,
    `{agent_id, is_version, definition_agent_id, conversation_id}` — and that
    conversation id is stable per role, per session, across runs. So the
    centre panel mounts the canonical `ChatRoomClient` (`agentId` +
    `conversationId`, read through `roleBinding()` in `types.ts`) and there is
    NO bespoke transcript, composer, or stream renderer in this feature any
    more (`TranscriptPane`, `Composer`, `StageRail`, `RoleStrip`,
    `NextQuestionsStrip`, `OpenQuestionsPanel` were deleted with v3). **Only
    the ACTIVE tab is mounted** — that is what keeps the execution system's
    one-conversation-per-surface assumption true; switching tabs unmounts the
    old room and mounts the new one, never several live at once. A role with
    no binding (the session was never started) renders the honest
    "hasn't joined yet" invitation — an EDGE CASE since the `/roles` wiring
    landed (2026-08-18), so it names which of "still opening" / "couldn't
    open" is true, carries the error text and a Try again, and never a
    spinner. It carries NO run control: `/roles` opens these rooms, not the
    workflow run, so a Start button here answered a question nobody asked
    while being the feature's only door to the run (removed 2026-08-18 —
    invariant 7's honesty applies to the run's home, which is now Finish).
14. **THE ANSWER-APPEND RULE (v3, structured as of 2026-08-22).** Answers
    written in the left panel live in the slice (`answerDrafted` /
    `answerDiscarded` / `selectPendingAnswers`), never only in a composer, and
    they ride the NEXT message as a structured `answered_questions` CONTEXT
    entry — a JSON array of `{questionId, questionText, answerText}` — so the
    speaking expert AND the Scribe both receive them, per THE USER-INPUT LAW
    (`common-docs/systems/agents/agent-variable-binding/FEATURE.md`).
    `PendingAnswersRider` (in `RoomChatPane`) writes the ledger via
    `setContextEntries` (rich form, `max_inline_chars` set high enough to
    guarantee inlining) and clears both the context entry
    (`removeContextEntry`) and the ledger (`pendingAnswersCleared`) once
    `submissionPhase === "persisted"` — context entries persist on the
    conversation until removed, so a stale entry would otherwise ride every
    later turn. A failed send leaves both in place, so it can never eat an
    answer. Server side: the context pipeline durably stamps an INLINE
    context value onto the turn's message
    (`cx_message.metadata.model_context` —
    `aidream/services/conversation_context/context_objects.py`
    `to_model_context_record`), and
    `aidream/services/vision_interview/answered_questions.py`
    (`extract_answered_questions`) reads that structured stamp back — no XML,
    no regex. Previously an `<answered_questions>` XML block glued onto the
    Expert's own message via `setUserInputText`; moved off THE USER-INPUT LAW
    violation (FOUND_DEFECTS.md history) once the context channel's
    continuation-turn delivery was confirmed live.
15. **THE DUPLICATE-STREAM RULE (v3).** The right-hand feed streams every
    role EXCEPT the one whose tab is live (`selectActiveRoleTab`) — that one
    is already streaming in the centre. Completed messages always land in the
    feed regardless.
16. **THE LEFT PANEL IS CARDS, AND IT OWNS THE HOLES LEDGER (v3).**
    `QuestionsPanel` renders ONE `QuestionCard` per question — question as the
    hero, category chip, age in rounds, and a status a human already knows:
    **Open · Pending · Answered · Dismissed** (`questionStatus()` in
    `QuestionCard.tsx` is the ONE place that mapping lives; Pending = a local
    answer waiting to ride the next message and says so on the card). The
    action set — Answer / Edit answer / Discard / Dismiss / Restore — is
    IDENTICAL on the card and inside `AnswerQuestionWindow`; the list view and
    the focused view never disagree. The window is a page-local `WindowPanel`
    (inline `onClose`, lazy-imported — no overlay registration), its entry area
    is `ProTextarea` (dictation mic verified live), and the typed text is held
    in `useDurableDraft` keyed by question id, so closing, reloading, or
    crashing never destroys it. **Save never sends.** The Adversary's
    `interview.hole` ledger lives at the bottom of this same panel — it has no
    other surface, and a hole needing human arbitration IS the room asking the
    Expert a question.


## Reuse-first — consumed, never rebuilt

entity-list shell + list-scope RPC template · `adoptForeignStream` + `activeRequests` +
`followWorkflowRunStream` / `selectWorkflowNodeStreams` · `RichDocument` ·
`BasicMarkdownContent` · `readAllRows` · resizable-panels (`ClientGroup`/`Handle`) ·
`RouteHeader` / `PageHeader` · `ConfirmDialog` / `TextInputDialog` / `@/lib/toast` ·
`uniqueChannelTopic` · the per-schema DB helper pattern (`interviewDb`) · `ProTextarea` ·
`Accordion` · chart tokens for role accents. **`ActiveRequest.nodeStreams` +
`appendWorkflowNodeStream` / `settleWorkflowNodeStream` + `followWorkflowRunStream` are generic
execution-system primitives contributed by this feature — any surface adopting a workflow run
gets live per-node tokens the same way. Never fork them.**

## Local debts

- **Generated types**: the `interview` schema, the `ivw_*` RPCs and `/vision-interview/*` paths
  are hand-declared/cast. When `pnpm sync-types` runs, remove the casts in `interviewDb.ts`,
  `browse/service.ts`, `browse/types.ts`, `useInterviewRun.ts`.
- `ivw_list_scoped.sql` is live and ledgered; migration checks must stay at zero pending before
  release.
