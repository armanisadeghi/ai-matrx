# Vision Interview — the multi-agent interview room

**Status:** v2 frontend (2026-08-17). Cross-repo system-of-record:
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
| Room | `app/(core)/vision-interview/[sessionId]/page.tsx` → `components/VisionInterviewRoom.tsx` (RouteHeader + full-width `StageRail` + 2 resizable panes: conversation center [transcript · next-questions strip · composer] · right side pane [living document / questions-holes tabs]) |
| New interview | `components/NewInterviewDialog.tsx` (direct Supabase insert → routes into the room) |

## Data flow

- **All plain DB reads/writes are direct browser → Supabase** via
  `utils/supabase/interviewDb.ts` (`.schema("interview")`) in `service.ts` —
  never through Python. Transcript/ledgers read with `readAllRows`
  (completeness-sensitive).
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
   speaks, `TranscriptPane` shows a `LiveTurnCard` off
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
   (the `StageRail`'s click-to-jump, ANY stage forward or back). Both arm
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
   `QuestionCategoryChip` (Lucide icons, chart tokens) in both the panel and
   the composer's `NextQuestionsStrip`. The strip (directly above the
   composer — the last thing the Expert reads) shows open questions matching
   the CURRENT stage's category, topped up to 3 with the oldest other open
   questions (`selectNextQuestions`); the full panel shows ALL questions with
   the current category grouped first (`selectQuestionsGroupedForStage`) so
   the Expert can answer ahead of schedule. Both reuse
   `composerInsertRequested` — never a second insert path.
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
