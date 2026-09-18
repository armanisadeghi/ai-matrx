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
| **Finish (the guided run)** | `components/RoomHeader.tsx` → `components/FinishInterviewDialog.tsx` — the ONE door to the workflow run, and therefore to `interview.finalize` and the three deliverables. **ONE press**: `useInterviewRun.finish` starts the run when none is waiting and sends `done` the instant it hands back, so the person never performs the server's two journeys themselves. The dialog names what the room still has open BEFORE the press, and opens each document the moment it exists |
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

17. **THE ROLE ROOM NEVER PRESENTS MACHINE CONTEXT AS HUMAN INPUT.**
    `RoomChatPane` mounts the canonical `ChatRoomClient` with
    `variablesPanelStyle="hidden"`; the seven role variables are populated by
    the room, not collected from the Expert. Persisted human bubbles and the
    Expert Feed read `chat.message.user_content`, while `content` retains the
    full rendered role template solely for model replay. Historical NULL
    projections fall back to `content`.

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

## Realtime

Realtime moved onto `@ai-matrx/realtime` (2026-09-07). `useInterviewRoom` lost ~40 lines of hand-rolled backoff ladder, attempt counter, healthy-timer and catch-up refetch; `onChannelDown` is replaced by `onBackfill`, which fires on tab wake and network restore as well as on a channel error — so a laptop that closed mid-interview no longer reopens to a room frozen at the last question it heard.

## Change log

- **2026-09-17** — **A new interview is filed in the organization the person
  selected.** `createSession` inserted `interview.session` with no
  `organization_id`, and `public._stamp_org_default` then stamped the
  CREATOR'S PERSONAL organization: all 53 live rows sit in a private workspace
  nobody chose, invisible to the people the vision is for. It now carries
  `ensureOrgId(undefined)` — the selected organization, which joins store
  hydration before answering — and refuses with
  `OrganizationContextError("organization_context_required")` when there is
  none; `NewInterviewDialog` and `NewInterviewExperience` render that refusal
  with its remedy ("Pick yours from the avatar menu") instead of the
  transport's programmer sentence. The write was invisible to
  `scripts/check-org-insert-scope.ts` until the same day, because
  `interviewDb(supabase).from("session")` resolved as `public.session` — a
  table the generated types do not have — and the ratchet absorbed it as
  "scope cannot be proved". Law:
  `../../../common-docs/policies/context-is-carried-never-rebuilt.md` rule 4.

- **2026-09-17** — **The room no longer guesses which conversation it is in, no
  longer prints the machine's own words in the thread, and no longer follows a
  run that is already over** (Masterwork cold walk 5, findings 7 and 8).
  *The guess:* `conversation_started` is computed live per `/roles` call and
  deliberately never persisted, so the copy on the session row can NEVER carry
  it — every room reading the persisted binding got `false`, called an
  already-used conversation a reservation, and sent its next turn as turn 1 with
  `is_new: true`. The server's 409 for exactly that — a raw UUID and "Pass
  is_new=false to continue it" — rendered inside a live interview thread, between
  the Sounding Board's reply and the composer. "Nobody has told us yet" is now
  its own fact (`conversationStartedKnown`), the room shows its own honest
  "Opening … room…" until the answer lands (`roomMayClaimMaterialization`), and
  the opening-statement send waits for it too rather than reading a stale `false`
  as "nobody has spoken here".
  *The leak:* any server error carrying no `user_message` reached the thread
  verbatim. `friendlyStreamError` (in `features/agents/components/run/`) shows a
  declared sentence with its remedy and keeps every original byte under Details;
  aidream's 409 now also carries a `user_message` of its own.
  *The dead run:* the reload-resume rule armed a follower for any session row
  carrying a `run_id`, including one whose interview was finished — the shape
  finding 8 described (a permanent "Working…" over a finished session with the
  document tabs unreachable). **That symptom did NOT reproduce on a brand-new
  session on 2026-09-17** — walked end to end on `origin/main` before any change:
  three real turns, Finish, leave, return, and all four tabs opened their
  documents. The reload-resume rule is still wrong for a finalized row and is
  fixed (`reloadResumeVerdict`), but it lands as a defensive fix, not as a
  verified repair of that walk's symptom. Guard for all three:
  `__tests__/the-room-never-shows-the-machine-talking.test.ts`.


- 2026-09-16 (later) — **A FINISH IS ONE REQUEST, AND `start` IS GONE** (fourth
  cold walk, finding 4: the same defect a third time, on a brand-new session,
  against the commits the entry below certified). `useInterviewRun.finish`
  branched on the run phase — send `done` to a parked run, otherwise START one
  and send `done` when it hands back — and a run's first act is a complete
  interview round. The walk-3 fix was verified against a session already parked
  on a human turn, the ONE branch that never runs a round; every fresh v3 room
  has no run at all, because the interview happens in the per-role chat tabs.
  `finish` now POSTs `/vision-interview/sessions/{id}/finish` (aidream
  `services/vision_interview/finalize.py`) from every phase, `start` is removed
  from the hook rather than hidden, and a deliverable that did not land is named
  in a toast with the remedy instead of showing "not written yet" forever.
  Verified live on brand-new session `2c4bbf69`: pressed once, finalized five
  seconds later, all three documents written. Guard:
  `__tests__/a-finish-needs-no-run.test.tsx` — it asserts what `finish` SENDS
  in every phase, which is what `a-finish-click-finishes.test.tsx` structurally
  could not (it mounts the dialog with a mocked `onFinish`, so it can only ever
  prove the dialog presses the button it was handed).

- **2026-09-16** — **The room is usable on a phone (jobs-bar-2026-09-16, item
  19).** At 390px the centre panel opened with six expert tabs wrapped over
  three rows — a third of the screen before one word of the conversation — the
  document controls beside them were unlabelled glyphs (`hidden sm:inline` on
  their only words), Advance and Finish were two blank boxes next to a
  truncated title, and a horizontal scrollbar ran under the whole thread. The
  room carried its own three-way pane switcher instead of `MobilePanelShell`,
  the primitive every other multi-pane route uses, so it inherited none of
  that work. It uses it now: the conversation IS the phone column, and the
  questions and expert feed are bottom drawers off one header control that
  carries the open-question count (`badge` — added to the shared primitive, so
  every route gets it). `RoomChatPane` gains a one-row phone bar: the live
  expert, and the documents, each behind one labelled control and one
  `BottomSheet`; the header's Advance moved into the expert sheet, spelled
  out, and Finish always carries its word. Desktop is byte-identical — proven
  by `components/__tests__/room-on-a-phone.test.tsx`, whose fourth case fails
  if the six-tab rail ever stops rendering at desktop width. The scrollbar was
  `MessageTimestamp`: a hover-only stamp kept in layout by `opacity-0`, under
  every chat in the app.

- **2026-09-15** — **And it can no longer sit on "Working…" over a run that is
  already DEAD (wall W9, second half).** A run's terminal STATUS and its
  terminal EVENT are written by two different places: `run_store.apply_status`
  flips `workflow.run.status`, and the scheduler separately emits `run_failed`
  / `run_errored` / `run_cancelled`. Every path that ends a run outside that
  emit — a lease or recovery sweep, `force-fail`, a worker killed between the
  two writes — leaves a dead row and a silent feed, and the room, which
  believed only the feed, spun forever. Fixed in the ONE canonical workflow-run
  client, so every consumer inherits it: `followWorkflowRunStream` now
  reconciles with the run ROW at every boundary — a clean `end`, a dropped
  socket, a stall, and reconnects exhausted — reading `GET /runs/{run_id}` and
  delivering the terminal event the feed owed (`reconcileEventFromRunRow`,
  exported and pure). A failed row read is never a new failure surface: it just
  keeps reconnecting. The room's own sentence now names the remedy
  (`RUN_ENDED_MESSAGE`). Forcing guard:
  `features/agents/redux/execution-system/thunks/__tests__/follow-workflow-run-row-reconcile.test.ts`
  drives the real thunk over a real SSE replay that omits the terminal event
  with the row already `errored` — red against the old follower, green now.
  🚨 **Boundaries alone were not enough, and only the live surface showed it:**
  the events feed replays its backlog and then subscribes to LISTEN/NOTIFY,
  holding the socket open with keepalive pings, so a terminal row produces NO
  boundary — no `end`, no drop, and no stall either, because every ping rearms
  the stall timer. With the boundary-only version on the preview the room sat
  on "The room is working… Working…" over an `errored` row for a full minute.
  The follower therefore also POLLS the row every `RECONCILE_POLL_MS` (20s),
  and a poll that settles the run aborts the read; a seventeenth guard case
  covers exactly that feed. Live proof, before and after, in
  `common-docs/projects/masterwork-methods-census/fix-evidence/`.

- **2026-09-16** — **A Finish click finishes. It never runs another
  conversation round** (third cold walk, finding 3 — the identical defect the
  second cold walk had filed one walk earlier, reproduced byte for byte). The
  terminal control was two server journeys wearing one button: in any phase but
  `waiting_human` the dialog's confirm called `onStart`, which starts a run
  whose first act is a live interview round; only in `waiting_human` did it
  send `done`. The button renamed itself between presses to cover the seam
  ("Finish the interview" → "Write the documents" → "Finish anyway"), and the
  server compounded it by REFUSING the first `done` and looping back into the
  router. A first-time Expert pressed Finish twice, watched the round counter
  go 3 → 4 → 5 and the open-question count go 5 → 8, and never received a
  Vision document, a Requirements document or a cleaned transcript. Both halves
  are closed: `useInterviewRun.finish` arms the intent and spends it the moment
  the run interrupts (one press, one label, `onStartRun` gone from `RoomHeader`
  entirely), and aidream's `routing.done_decision` always converges, recording
  what was left open instead of refusing. The second-chance consent moved to
  where a person can read it — the dialog now says what the room still has open
  BEFORE anything is sent, and it never blocks the control. Forcing guards:
  `__tests__/a-finish-click-finishes.test.tsx` here (red against the pre-fix
  dialog in `idle`, `complete` and `error`, and on the renaming label) and
  `aidream/services/vision_interview/tests/test_a_finish_finishes.py` there.

- **2026-09-15** — **The room can no longer sit on "Working…" over a run that
  does not exist (wall W9).** `handleInlineEvent` returned on every non-`data`
  event, so the server's `fatal_error` envelope — the ONE thing the inline
  start stream sends when `start_session_run` raises before a run row exists —
  was dropped. `callApi` resolved happily (HTTP 200, stream fully consumed),
  `runStream` reported the request accepted, and the phase stayed `starting`
  forever: the Finish dialog read "Handing the interview to the room… Working…"
  for nine minutes while the server had already crashed and said so. The wire
  reader is now the pure exported `interpretInlineEvent` (run_id / failure /
  nothing), an `error` event lands in `runFailed` with the server's
  person-facing sentence, and a stream that ends having said nothing terminal
  fails loudly with `SILENT_START_MESSAGE` instead of spinning. Forcing test:
  `hooks/__tests__/inlineStartVerdict.test.ts` (red against the old
  drop-everything behaviour, green now).

- **2026-09-09** — Role rooms hide programmatic variable collection and render
  pristine `user_content`; internal role templates no longer appear as Expert
  input or feed speech.
