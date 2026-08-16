# Vision Interview — the multi-agent interview room

**Status:** v1 frontend (2026-08-16). Cross-repo system-of-record:
`common-docs/systems/vision-interview/FEATURE.md` — read it first; this file is
only the matrx-frontend half. Backend (engine, workflow, service, `interview.*`
tables) lives in aidream (`aidream/services/vision_interview/`).

Six capped roles (Amplifier, Cartographer, Archaeologist, Adversary, Architect,
Scribe) interview a human who holds a vision; the tables are the product, the
workflow run orchestrates. A crashed run loses nothing — the room re-hydrates
from `interview.*`.

## Entry points

| Surface | Route / file |
|---|---|
| List page | `app/(core)/vision-interview/page.tsx` → `components/VisionInterviewListPage.tsx` (canonical entity-list shell; config `browse/listConfig.tsx`) |
| Room | `app/(core)/vision-interview/[sessionId]/page.tsx` → `components/VisionInterviewRoom.tsx` (RouteHeader + 3 resizable panes: transcript · living document · questions/holes) |
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
5. **Stage advancement is human-controlled and rides the resume payload**
   (`advance_stage`), so the Advance control arms only while the run waits on
   the human (`waiting_human`).
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
   accents on `ROLES[key].accent`, human = primary) is the ONE avatar disc —
   presence strip, persisted turns, live cards, summon menu. Turns follow the
   /chat message language (role turns plain, human turns primary-tinted
   bubble, hover copy); the living document splits the Scribe's H2 sections
   into an Accordion (string split on PERSISTED markdown — every body still
   renders through `RichDocument`, never a hand parser).

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

- **`ivw_list_scoped.sql` is written but NOT applied** — orchestrator applies
  via Supabase MCP + ledgers it; align the `iam.permissions.resource_type`
  token (`'interview_session'`) with the backend's registry entry first. Until
  applied, the list page's RPC calls fail loudly (error banner in the shell).
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
