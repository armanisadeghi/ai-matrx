# Vision Interview — the multi-agent interview room

**Status:** v3 frontend (2026-08-18) — the THREE-PANEL room. Cross-repo system-of-record:
`common-docs/systems/vision-interview/FEATURE.md` — read it first; this file is
only the matrx-frontend half. Backend (engine, workflow, service, `interview.*`
tables) lives in aidream (`aidream/services/vision_interview/`).

Seven capped roles (Sounding Board, Archaeologist, Amplifier, Cartographer,
Adversary, Architect, Scribe) interview a human who holds a vision; the tables
are the product, the workflow run orchestrates. A crashed run loses nothing —
the room re-hydrates from `interview.*`. **v2 stage arc:** capture → ground →
enhance → articulate → stress → shape → revisit → done, ONE primary role per
round (plus the Scribe's silent apply; observers run silently — only their
EFFECTS land as questions/doc updates). Legacy v1 stage values
(expand/test/loop) may still sit on old session rows until the server heals
them — `normalizeStage` in `types.ts` maps them for display
(expand→enhance, test→stress, loop→revisit); never render a raw stage key.
"Sounding Board" is a PROVISIONAL name (noted in `types.ts`).

## Entry points

| Surface | Route / file |
|---|---|
| List page | `app/(core)/vision-interview/page.tsx` → `components/VisionInterviewListPage.tsx` (canonical entity-list shell; config `browse/listConfig.tsx`) |
| Room | `app/(core)/vision-interview/[sessionId]/page.tsx` → `components/VisionInterviewRoom.tsx` — RouteHeader + THREE resizable panels (cookie `vision-interview-room-layout-v3`): `QuestionsPanel` (~22%) · `RoomChatPane` (~50%) · `ExpertFeedPanel` (~28%); mobile switches panes (Questions · Room · Feed) |
| One expert's room | `components/RoomChatPane.tsx` — `StageTabs` + the CANONICAL `ChatRoomClient` for the active role, plus the Scribe's document/deliverables and the answer-append rider |
| Stage tabs | `components/StageTabs.tsx` — one substantial button per stage primary (icon disc + role name + stage label together) |
| New interview | `components/NewInterviewDialog.tsx` (direct Supabase insert → routes into the room) |

## Data flow

- **All plain DB reads/writes are direct browser → Supabase** via
  `utils/supabase/interviewDb.ts` (`.schema("interview")`) in `service.ts` —
  never through Python. Transcript/ledgers read with `readAllRows`
  (completeness-sensitive).
- **THE ROOM'S ONE REQUIRED SERVER CALL — `POST /vision-interview/sessions/{id}/roles`.**
  `hooks/useRoleBindings.ts` (owned by `useInterviewRoom`) fires it when the
  room opens, for EVERY session, before the person can talk. Each role
  resolves through Mandate `vision_interview.<role>`, and only the server may
  resolve a mandate — so without this call `session.role_bindings` is empty
  and all six stage tabs are dead. It needs NO workflow run and is idempotent
  (the same conversation ids come back every time), which is why it can be
  unconditional. The response is merged into the slice
  (`roleBindingsResolved` → `resolvedRoleBindings`, read through
  `selectRoleBindings`, which layers it OVER the session row) so the tabs
  mount the instant it lands — never waiting on a realtime echo. Failure
  retries with capped backoff (1s → 30s) for as long as the room is open and
  is stated honestly on screen with a Try again control (`rolesPhase` /
  `rolesError`) — never a silent dead tab.
- **THE HIJACK — `POST /vision-interview/sessions/{id}/observe`.** The person
  now talks to an expert down the ORDINARY agent-chat path, which deleted the
  orchestrated round the Scribe used to ride on. `hooks/useObserveRoleTurns.ts`
  tells the server an exchange finished and the server does the rest
  server-side: mirror the conversation's new messages into `interview.turn`,
  honour the `<answered_questions>` block, run the Scribe over the living
  document, run the answer tracker over the open questions
  (aidream `services/vision_interview/live_turns.py`).
  **The completion signal is the real one:** the execution system's
  `activeRequests` row for the mounted conversation
  (`selectLatestRequestId`) reaching a terminal `status` —
  `complete` / `error` / `timeout` / `cancelled`, the same set the slice
  stamps `completedAt` on. Never a timer, never the send.
  **ONE ping covers both speakers:** `ingest_role_conversation` mirrors every
  not-yet-mirrored message keyed on `chat.message.id`, the person's and the
  expert's, so a second ping on send would re-mirror nothing. Firing on EVERY
  terminal value (not only `complete`) is what carries the person's words
  through when the expert's reply fails. A second ping fires once when an
  expert's room MOUNTS, repairing an exchange that settled after the person
  switched tabs — free, because a pass with nothing new returns before any
  model is called. Fire-and-forget throughout: caught failures, no toast,
  nothing blocked; a missed ping is repaired by the next.
- **Run orchestration only** goes to aidream via `callApi`:
  `POST /vision-interview/sessions/{id}/start` (path cast `as never` until
  api-types regenerate) and the typed `POST /runs/{run_id}/resume`
  (`checkpoint_id` from the `run_interrupted` event; `resume_value` carries
  `message` / `summon_role` / `advance_stage`).
- **TWO wires, both canonical** (`hooks/useInterviewRun.ts`; verified wire
  truth 2026-08-16): the start/resume NDJSON responses DETACH immediately by
  design (`workflow_run_started` → `workflow_run_detached` → `end` — the
  scheduler survives client disconnect), so they carry no tokens; they are
  **adopted** with `adoptForeignStream` only to mint the `activeRequests` row
  and learn the `run_id`. The REAL live wire is the run's SSE events feed
  (`GET /runs/{run_id}/events/stream`), followed with the execution system's
  `followWorkflowRunStream`: durable lifecycle events (`node_started` /
  `node_completed` → active speaker via `roleFromNodeId`; `run_interrupted` →
  composer arms; `run_resumed`; terminals) drive choreography, and the
  ephemeral typed `node_stream` token frames land in
  `activeRequests.nodeStreams` keyed by workflow node. Never hand-parsed.
- **The SSE follower arms EXACTLY ONCE per run_id.** Re-arming a live
  follower aborts its connection and replays the feed from seq 0 into the
  choreography (PR #145 review). The FIRST adoption of a run owns the
  `activeRequests` row for the run's whole life — later resume adoptions
  mint inline rows the room deliberately ignores; the guarded
  `startFollowing` re-arms only after the previous follower SETTLED
  (terminal event / reconnects exhausted), and never on a failed resume.
  `run_errored` is in the thunk's terminal set (pinned by
  `workflow-node-stream.test.ts`, with the per-requestId selector-instance
  cache of `selectWorkflowNodeStreams`).
- **Room state** lives in `redux/vision-interview.slice.ts`
  (`state.visionInterview`): room rows + run choreography + the
  sessionId→requestId adoption map. Streaming content state stays in
  `activeRequests` (execution system) — this slice never duplicates it.
- **Realtime**: ONE channel per open room (`service.ts::subscribeToRoom` —
  turn/question/hole filtered by `session_id`, plus the session row), owned by
  `hooks/useInterviewRoom.ts`: ONE batched hydration dispatch, exponential
  backoff (1s→30s) + catch-up refetch on channel drop, counter resets only
  after 30s healthy.

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
   `advance_stage` (the header's Advance control) and v2's `goto_stage`
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
    live the moment finalize lands.
12. **Failure honesty (v2 §17):** every run/start/resume error surface must
    SAY the Expert's words are safe — the draft persists on-device
    (`useDurableDraft`) and a sent message lands as a turn before agents run
    — and offer the retry in the same breath. Never lose composer content
    (acceptance-gated clearing, invariant 7).

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
    spinner.
14. **THE ANSWER-APPEND RULE (v3).** Answers written in the left panel live in
    the slice (`answerDrafted` / `answerDiscarded` / `selectPendingAnswers`),
    never only in a composer, and they ride the NEXT message as an
    `<answered_questions>` XML block so the speaking expert AND the Scribe
    both receive them. THE SEAM: the canonical chat has no outgoing-text
    transform, so `PendingAnswersRider` (in `RoomChatPane`) writes the block
    into the composer draft through `setUserInputText` — the same action the
    Expert's own keystrokes dispatch — and clears the ledger
    (`pendingAnswersCleared`) only when `submissionPhase === "persisted"`,
    i.e. the server reserved the request. A failed send therefore can never
    eat an answer. The block is visible to the Expert on purpose.
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

## Doctrine (reuse-first)

Consumed, not rebuilt: entity-list shell + list-scope RPC template ·
`adoptForeignStream` + `activeRequests` + `followWorkflowRunStream` /
`selectWorkflowNodeStreams` · `RichDocument` · `BasicMarkdownContent` ·
`readAllRows` · resizable-panels (`ClientGroup`/`Handle`) · `RouteHeader` /
`PageHeader` · `ConfirmDialog` / `TextInputDialog` / `@/lib/toast` ·
`uniqueChannelTopic` · per-schema DB helper pattern (`interviewDb`) ·
`ProTextarea` (composer body — built-in dictation mic, transcription append,
overflow menu; the Scribe working-document precedent) · `Accordion`
(document sections) · chart tokens for role accents.
New primitives contributed to the execution system (generic, not
interview-specific): `ActiveRequest.nodeStreams` +
`appendWorkflowNodeStream`/`settleWorkflowNodeStream` +
`followWorkflowRunStream` — any surface adopting a workflow run gets live
per-node tokens the same way.

## Deferred / open items (v1)

- **`ivw_list_scoped.sql` is live and ledgered** in the shared database. The
  list page uses the scoped RPCs directly; migration checks must remain at
  zero pending before release.
- **Generated types**: `interview` schema + `ivw_*` RPCs + `/vision-interview/*`
  paths are hand-declared/cast; `pnpm sync-types` (outside this container)
  replaces them — remove the casts in `interviewDb.ts`, `browse/service.ts`,
  `browse/types.ts`, `useInterviewRun.ts`.
- Mobile: simple pane switcher in the room (no Drawer treatment yet).
- Revision history is a count + summaries only (no diff viewer);
  `getRevisionDocument` exists for the future viewer.
- No `/vision-interview/admin` map page yet; no dedicated `SourceFeature` key
  (rows use registered `"agents-other"`).
- Cartographer "asserted / unverified claim" badge (open Q7) — awaits a
  structured marker in turn rows.

## Change log

- 2026-08-18 — **v3 LAST MILE: the room opens itself, and the Scribe stays
  current.** The v3 rewrite read `session.role_bindings` but nothing ever
  created them and nothing told the server a reply had finished, so a new
  session landed in six dead tabs and the living document never moved.
  (1) `roomApi.ts` + `hooks/useRoleBindings.ts` — `POST /roles` on room open,
  for every session, no run required, merged into the slice
  (`resolvedRoleBindings` / `selectRoleBindings`) so tabs mount immediately;
  capped-backoff retry with an honest failed state + Try again.
  (2) `hooks/useObserveRoleTurns.ts` — `POST /observe` when the mounted
  conversation's request SETTLES (terminal `activeRequests.status`), plus one
  repair ping on room mount; one ping covers both the human's and the
  expert's words because the server mirrors every unmirrored message.
  (3) `StageTabs` / `RoomChatPane` read the merged bindings map.
  VERIFIED live against a brand-new session: 8 bindings persisted with
  `run_id` NULL, a real streamed reply, `interview.turn` rows for human +
  expert (`source=role_conversation`), the Scribe's 1916-char `document`,
  7 `question` rows and 1 `document_revision`, 3 turns over 2 distinct
  `message_id`s (no double-mirror), and each expert on its own conversation.

- 2026-08-18 — **v3: the three-panel room, on the canonical chat.** (1) LAYOUT:
  `VisionInterviewRoom` rebuilt as three resizable panels — questions ·
  room · expert feed (new cookie `…-v3`); mobile is a Questions/Room/Feed
  switcher. (2) STAGE TABS: `StageTabs` — one substantial button per stage
  primary, role icon in its accent disc WITH the role name and stage label in
  the same button (Arman rejected icon-and-name-apart chips); the bar wraps so
  every expert stays visible instead of scrolling out of reach.
  (3) THE CENTRE IS THE CANONICAL CHAT: `RoomChatPane` resolves the active
  role's `role_bindings` entry and mounts `ChatRoomClient` with its agent +
  conversation; the Scribe's living document and the deliverables stay
  reachable from the same bar (the chat stays MOUNTED underneath, so reading
  the record never interrupts a stream), and `goto_stage` lives on an inline
  "Move the interview here" bar. (4) SLICE: `activeRoleTab` +
  `pendingAnswers` with the contract's actions/selectors; `composerInsert`
  retired with the composer. (5) DELETED with the rewrite: `TranscriptPane`,
  `Composer`, `StageRail`, `RoleStrip`, `NextQuestionsStrip`,
  `OpenQuestionsPanel`. OPEN: the v2 raw-audio TURN STAMPING
  (`useTurnAudioAttachment` + `dictationAudio*` slice state) lost its producer
  with the old composer — dictation in the room is still attributed and
  durably saved (`RecordingOriginProvider`, surface
  `vision-interview.room`), but nothing stamps a turn any more, because the
  human's words are now chat messages rather than `interview.turn` rows.

- 2026-08-18 — **The opening and the wizard, rebuilt from Arman's live review.**
  (1) NEW-INTERVIEW EXPERIENCE: the cramped dialog is no longer the front door —
  `/vision-interview/new` (`NewInterviewExperience`) is a full-page invitation:
  big headline, generous dictation-first `ProTextarea` (mic called out in
  copy), optional name (auto-derived from the vision's opening words), and the
  room introduced as icon+name pills. Same durable-draft key as the old dialog
  so in-flight drafts carry over. (2) THE WIZARD: `StageRail` rebuilt as big
  buttons — role icon in its accent disc + stage label + leader line TOGETHER
  ("Amplifier is with you"), check badges on past steps, chevron separators,
  accurate v2 steps; the separate icon-only `RoleStrip` row is unmounted from
  `TranscriptPane` (icons never float apart from their text). (3) FAILURE COPY:
  the composer's error banner leads with a human sentence + the safe-words
  guarantee; the raw error moved behind a "Technical details" expander — a
  Pydantic dump is never the headline.

- 2026-08-18 — **v2 remainder: raw audio + deliverables.** (1) RAW-AUDIO
  CAPTURE (§13.1): new generic primitive
  `features/audio/dictationAudioRegistry.ts` — the shared recorder's
  canonical upload path now announces each dictation-audio save (fileId +
  origin) or failure (in-memory blob + retry). Composer declares a
  `RecordingOrigin`, shows a saved-audio chip and an honest
  failed-upload/retry banner; accepted send/start queues the ids;
  `useTurnAudioAttachment` stamps `interview.turn.audio_file_id` (guarded
  IS NULL write) onto the server-created human turn; `TurnCard` grows a
  Listen chip → `<InlineMediaRef as="audio">`. (2) DELIVERABLES (§13.3):
  `session.cleaned_transcript`/`vision_document`/`requirements_document`/
  `finalized_at` hand-declared; side pane + mobile switcher grow
  Vision/Requirements/Transcript tabs (`DeliverablePane`: RichDocument +
  copy + .md download), rendered only once finalize writes them; fields
  flow live through the existing session realtime. (3) Question aging
  (v1 §14) verified as already shipped (age-in-rounds, louder past 2/3).
  Verified in the browser (desktop + mobile) against a session with
  deliverables + a stamped audio turn set via SQL.
- 2026-08-17 — **v2 room (backend v2 contract).** (1) STAGES: new arc
  capture→ground→enhance→articulate→stress→shape→revisit→done mirrored in
  `types.ts` (`STAGES` — label, primaryRole, questionCategory per stage);
  legacy expand/test/loop display-mapped via `normalizeStage` everywhere a
  stage renders (room, role strip, browse column + facet chips). (2) STAGE
  RAIL: full-width `StageRail` under the header — every stage visible,
  click-to-jump sends `goto_stage` on the resume payload, armed only in
  `waiting_human` with honest tooltips; the header stepper/stage chip
  retired (Round + Advance stay). (3) LAYOUT RE-CENTERED on the
  conversation: 2-pane resizable group (new cookie
  `vision-interview-room-layout-v2`) — transcript+composer center, living
  document moved to the right pane with the questions/holes panel as a
  sibling tab (open-count badge); mobile keeps the 3-way switcher.
  (4) NEXT QUESTIONS: `NextQuestionsStrip` directly above the composer —
  stage-category-matched open questions (top-up to 3 oldest others),
  click inserts the Q/A block via `composerInsertRequested`.
  (5) CATEGORIES: `interview.question.category` added to the hand-declared
  row type; `QuestionCategoryChip` (Lucide + chart tokens) in panel + strip;
  panel groups current stage's category first. (6) SOUNDING BOARD: seventh
  role (provisional name), `role_sounding_board` node mapping, chart-6
  accent (new token in globals.css), everywhere ROLES renders; summon copy
  now says the summoned role LEADS the next round (v2: one primary per
  round). (7) SAFE-WORDS failure copy: the error banner states drafts +
  sent turns are durably saved and points at Try again.
- 2026-08-18 — **The room made honest, from Arman's broken live session.**
  (1) RELOAD-RESUME: on hydrate, a session carrying a `run_id` while the hook
  is idle mints an `activeRequests` row (`ensureAdopted`) and follows the
  run's SSE feed — the durable replay re-drives the choreography into the
  run's REAL state (running / waiting_human / errored), so a reload never
  shows a dead "Start" over a live run and a server-side run death now shows
  its error instead of an eternal hang. (2) DOCUMENT SECTIONS: `DocumentPane`
  parses the backend's `<!-- matrx:section:key -->` markers (and the retired
  `<key>` XML wrappers, and bare-H2 fallback) — a tag never reaches the user;
  copy strips markers. (3) SCRIBE TURNS render as a quiet activity card; a
  legacy raw-JSON envelope turn (Scribe or Adversary) heals into a readable
  summary in `TurnCard.displayContent`. (4) STRUCTURED live streams
  (Scribe/Adversary, `STRUCTURED_ROLES`) never render raw JSON tokens — a
  working label instead; a Thinking placeholder card appears on
  `node_started` before the first token. (5) CLICK-TO-ANSWER: each live
  question has an Answer button → `composerInsertRequested` appends a
  `**Q:**/**A:**` block to the durable draft and focuses the composer.
  (6) The interrupt-prompt banner is height-capped (it once squashed the
  transcript to 8px); Start reads "Continue" after a completed run.
- 2026-08-16 — Room surface rebuilt to the /chat + Scribe bar (Arman's
  rejection of v1): `RoleAvatar` presence language with chart-token role
  accents (strip, turns, live cards, summon menu); turns in the canonical
  conversation style (hover copy, human bubble); always-alive composer
  (pre-start opening statement → `appendVisionStatement`, queued drafts
  during runs, acceptance-gated clearing, per-button busy — no dead ends);
  living document as collapsible H2 sections; questions/holes as a dense
  instrument panel (sticky count headers, state rails, hover controls);
  stage stepper in the header. PR #145 review fixes: follower armed once
  per run_id, `run_errored` terminal, `selectWorkflowNodeStreams` factory
  cache (+ regression tests).
- 2026-08-16 — NEVER-LOSE-CONTENT contract (Arman's ruling after a dictated
  vision was lost in the deploy-outage error storm): the composer and the
  new-interview dialog hold their drafts in `useDurableDraft`
  (`hooks/useDurableDraft.ts` — localStorage write-through, restore on
  mount), cleared ONLY after the room durably accepted the content; a
  vision statement saved on the session but not yet run renders in the
  transcript pane as "Your vision — saved to this session", because saved
  but invisible reads as lost. The clearing rule is load-bearing: never
  clear a draft on send-click — only on acceptance, and only once the
  content is visible somewhere durable.
- 2026-08-16 — Mobile breakage pass (Arman's screenshots) + honest network
  errors: RoomHeader mobile chip is stage-label-only and Advance is icon-only
  on xs (title no longer collides); composer drops the pinned text-stats bar
  (`enableTextStats={false}`); `ProTextarea` (canonical) reserves a
  `pointer-coarse:` right gutter and keeps its mic/menu cluster visible on
  touch, and its stats bar is desktop-only; `ErrorInspectorBadge`/`AssistsDock`
  lifted above the mobile bottom band. Transport failures (Safari "Load
  failed" — the 11-error burst was a deploy swap window on the server) now
  surface as "server may be restarting" copy via `isTransportFailure` in
  `useInterviewRun` and `useMicField` instead of the browser's wording. The
  exact route-scoped capture is yellow in `errorTierRules`: it remains visible
  locally but cannot persist one `system_error` row per retry.
- 2026-08-16 — Live token streaming shipped end-to-end: `followWorkflowRunStream`
  follows the run's SSE events feed into `activeRequests.nodeStreams`;
  `TranscriptPane` renders per-role `LiveTurnCard`s that resolve seamlessly
  into the persisted `TurnCard` (no double-render); choreography moved off the
  detaching inline stream onto the SSE feed (it was previously reading a wire
  shape that never arrived). Deferred live-token item closed.
- 2026-08-16 — Feature created: list page (entity-list config + ivw RPC
  migration), room (transcript/document/questions panes, role strip, composer
  with summon + interrupt resume, stage advance), slice + realtime with
  monotonic echo guard, run adoption via adoptForeignStream.
