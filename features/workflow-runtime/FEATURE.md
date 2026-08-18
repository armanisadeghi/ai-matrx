# Workflow Runtime — the surface where workflows RUN

**Status:** Phase 1 (the plumbing) — live. Phases 2+ (Run Surfaces, the builder, AI modes) tracked
in the cross-repo plan.
**Cross-repo system-of-record:** `common-docs/systems/workflow-runtime-ui/PLAN.md` — the rulings
(R1–R12), the scale target (20–100 nodes, nested runs), and the phase plan live THERE; this doc is
the code contract for what exists in this repo. Read the plan before extending this feature.

## What Phase 1 is

The **Run Stream Adapter** and everything a run surface needs to exist: one multiplexed workflow
run stream (SSE + poller on one durable cursor) demultiplexed into (a) a tree-aware `workflowRuns`
Redux slice tracking EVERY node, and (b) bounded per-node streaming **lanes** — real
`activeRequests` rows fed through the canonical `StreamBlockAccumulator` — so
`<MarkdownStream requestId/>`, `LiveRunDisplay`, and kind components render workflow node output
with ZERO new rendering code. Plus trigger points, lifecycle controls, and the zero-config board
that is the exit-test surface.

## Parts

| Part | File | Contract |
|---|---|---|
| Event vocabulary | `types.ts` → `@/types/python-generated/workflow-events` | GENERATED from `matrx_graph/types/events.py` (the durable events) + aidream's `services/runtime/workflow_events.py` (ephemeral `node_stream`, router handshake, `run_announce`). `types.ts` re-exports them and adds the FE-only pieces: the REST projections (`RunEventRecord`, `RunRow`) and the helpers. **Never hand-edit an event shape** — this file and workflow-studio's were two hand mirrors that drifted; both now consume ONE artifact, refreshed by `pnpm sync-types` (bundle `workflow-events-ts`) and guarded by aidream's `generate_types.py --check` in `release.sh`. `invocationKeyOf(nodeId, dispatchId, itemIndex)` is THE lane identity — `node_id` alone is never a completion key. |
| SSE client | `transport/sse.ts` | Fetch-based (EventSource can't set Authorization). Handles CRLF, partial frames, comment heartbeats. |
| Run event source | `transport/run-event-source.ts` | SSE preferred + poller fallback on ONE `after_seq` cursor; claim-on-first-frame; 20s stall detector; ported from workflow-studio's proven pair. `node_stream` frames carry no seq and never advance the cursor. |
| **The slice** | `redux/workflow-runs.slice.ts` | Tree-aware (`byRunId`, children auto-attach on `subgraph_run_linked`). Every node TRACKED: invocation states with fan-out aggregation, costs, progress, emissions, work sets, interrupt, capped text tails. |
| Selectors | `redux/workflow-runs.selectors.ts` | Memoized, per-property, stable-empty. `selectNodeAggregate` derives the aggregate phase (a node is settled only when `invocations.length >= expectedCount`). |
| **Lane manager** | `redux/lane-manager.ts` | THE LANE BUDGET (`MAX_STREAMED_LANES = 12`): every node tracked, only a bounded set streamed. ONE shared flush timer for all lanes (never one per stream). Lanes are real `activeRequests` rows + canonical accumulators; retention rules apply (`LIVE_RUN_RETENTION.md`). |
| **The adapter** | `redux/adopt-workflow-run.thunk.ts` | `adoptWorkflowRun({runId})`: attach → run row + heartbeat tails → durable replay (`?after_seq=`, paged) → live follow → lane routing → child runs (depth ≤ 3, count ≤ 10, shared budget). Token history is unreplayable BY DESIGN — refresh resumes from tails + durable outcomes. |
| Trigger points | `trigger-points.ts` | Ruling R2: named, enumerable moments derived from the DEFINITION (`run:*`, `node:<id>:*`, `edge:<id>:traversed` — client-DERIVED, the engine emits no edge events — `deliverable:ready`, `mark:<name>`), resolved against run state. Pure module. |
| Hooks | `hooks/useWorkflowRun.ts`, `hooks/useWorkflowRunControls.ts` | Adoption is refcounted per runId (two watchers share one adapter). Controls are the ONLY lifecycle verbs — start/pause/resume/cancel/answer-interrupt/retry/skip via `callApi`. |
| **THE LIVE RUN EXPERIENCE** | `components/run/RunStage.tsx` | The surface a person actually watches, composed like the podcast studio: hero + promise → journey rail + activity feed → authored readouts → deliverables. Hoists the authored progress rails into the always-visible journey (`hideProgressRails`) and renders the failure/interrupt cards itself (`hideRunStatusCards`), so nothing is drawn twice. Falls back to `deriveDefaultSurfaceConfig` when a workflow has no authored surface. |
| Run routes | `app/(core)/workflows/[id]/page.tsx`, `app/(core)/workflows/runs/[runId]/page.tsx` → `components/run/WorkflowRunPage.tsx` | One body, two doors: `/workflows/[id]` sets up + runs (run id rides `?run=`), `/workflows/runs/[runId]` is the run's permalink (THE DOOR LAW). Each resolves the other, so a refresh always lands back on the live run. `(core)` conformant: `RouteHeader`, body `h-full overflow-hidden`, one inner scroll. |
| Hero + the promise | `components/run/RunHero.tsx` | Status, elapsed (from the ENGINE's start, not the attach), cost, step count, and the chip row naming every deliverable **from frame zero** — the ProductionTeaser job, generalized. Fixed heights: nothing below it moves as state changes. |
| Journey rail | `components/run/RunJourney.tsx` | Every step of the DEFINITION present immediately (not just the ones the run has reported), each with its author's label, its own icon, and what it will produce. Three layers while a step runs: its freshest REAL signal, the authored synthetic sub-steps (the guaranteed floor — never removed), the phase. Both retire on completion; the full trace lives in the feed. |
| **Activity truth-feed** | `components/run/RunActivityFeed.tsx` + `components/run/activity-copy.ts` | The workflow twin of the podcast's `ResearchActivityFeed`: the actual tools called, the engine's own phases, `node_progress` sentences, per-step durations. `activity-copy` is the ONE place wire markers become sentences. Tool and warning markers are parseable JSON summaries; bare tool names and mid-string warning JSON remain legacy fallbacks. Renders nothing when the backend said nothing. |
| Deliverables | `components/run/RunDeliverables.tsx` | Every step declaring an `output_kind`, ghosted as "coming up" then becoming a real panel rendering its canonical kind component. Skips nodes the authored surface already renders — one shape, one component, once per screen. Lives at the BOTTOM so the surface only grows. |
| Step presentation | `components/run/node-presentation.ts` | Pure derivation of label / family / lucide icon / declared `output_kind` from the definition. This is what makes "what to look forward to" possible before a single node starts. |
| Agent output reader | `agent-run-output.ts` | THE reader for an `ai.agent.start` node's settled output — `final_text` / `structured_output` ONLY. The rest of that envelope (`messages`, `usage`, `metadata`, ids) is plumbing and must never reach a reader. |
| Failure card | `components/run/RunFailureCard.tsx` + `run-failure-explanation.ts` | Failure as a first-class state: plain-language headline, the failing step by its author's name, the one next action, and the technical cause one tap away. `explainRunFailure` owns the copy (add a pattern there, never a bespoke string here) and carries an optional one-click `action` — the education COPPA gate routes to the page that clears it. |
| Zero-config board | `components/WorkflowRunBoard.tsx` | Tier 0 presentation: status rows for every node, lanes via `LiveRunDisplay variant="bare"`, settled kind-checked output via `KindInstanceRender`, interrupt answer card, recursive child boards (`adopt={false}` on children — the parent adapter already follows them). |
| Shared readout parts | `components/readout-parts.tsx` | THE one per-invocation body (`InvocationBody`) + `PhaseIcon` / `PHASE_LABEL` / `InterruptCard` — consumed by the board AND every readout; never fork a second copy. Resolution order: a lane **that has carried something** → `LiveRunDisplay`; settled kind → `KindInstanceRender`; textTail; settled JSON → the canonical viewer via `MarkdownStream`; error; still working → the honest working state with its live progress line. **An empty lane never wins** — the adapter opens one for every non-fan-out node including nodes that never stream a token, and treating it as truth rendered an empty pane over the output the step had actually produced. |
| Surface config | `surface/config.ts` | The Run Surface document (R1/R6/R7): 24-col `pos`, readout sources (node/group/childRun/progressRail/static/action), pages, visibility; tolerant parse + strict validate. `deriveDefaultSurfaceConfig` builds a real surface from the DEFINITION for a workflow nobody has authored one for (steps that think or declare an `output_kind` become full-width readouts). Additive only — the builder writes the same document. |
| Progress rail | `components/ProgressRailReadout.tsx` | The generalized podcast rail: per-node rows from selectors + authored SYNTHETIC sub-steps (randomized 2.2–5.5s cadence, last held until the node leaves "running", snap-all-done), 99%-cap progress bar until the run is terminal. Animation state is presentation-local — refresh restarts it by design. |
| Readout renderer | `components/ReadoutView.tsx` | One readout's bare content per source kind; multi-run modes stack/latest/table (table = the canonical `MatrxDataTable` over invocations — item/status/output/duration, every column sorts + filters); childRun renders the child's OWN authored compact surface when one exists (R9 — `getDefaultSurface(childDefId, {profile:"compact"})` → nested `RunSurfaceView adopt={false}`), else a compact status summary with an expandable full board; static markdown via `MarkdownStream` content mode. Node and rail labels use the resolved spec type with a human fallback, never expose graph-local IDs as dead-end UI text. Visible node readouts promote running lane-less invocations via `useViewportLanePromotion` (IntersectionObserver → `ensureLane`, seeded with the tracked tail). |
| **The builder** | `builder/RunSurfaceBuilder.tsx` + `app/(core)/workflows/[id]/design/page.tsx` | Build left, watch right — the agent-apps `LiveBuilder` paradigm applied to a run page. The right pane mounts the REAL `RunSurfaceView`; there is no wireframe, no miniature, no mock. Loads definition + default surface, holds one draft, CAS-saves, and offers a workflow with no surface the generated one already rendered beside the button. `(core)` contract: body `h-full overflow-hidden`, chrome via `RouteHeader`. |
| Builder: plain language | `builder/vocabulary.ts` | THE TRANSLATION LAYER — the one place the document becomes sentences and back. Steps get a human role from their spec type (`ai.agent.*` → "An AI writes this, live"); trigger points become a two-part question (a moment kind + which step) instead of a 70-entry dropdown; an unrecognised trigger round-trips as "a moment set up elsewhere". No UI string names a readout, a source kind, or a trigger id. |
| Builder: layout model | `builder/layout-model.ts` | ORDER + NAMED WIDTH, never coordinates. A screen's panels are an ordered list; `packScreen` flows them left-to-right and wraps, deriving every x/y, so misalignment is not expressible. Heights stay exactly as authored until the person changes them. `normalize` reproduces the live Study Pack positions byte-for-byte (pinned by `builder/__tests__/layout-model.test.ts`), and every function spreads, so unknown config keys survive a round trip. |
| Builder: the sample run | `builder/sample-run.ts`, `builder/useSamplePreviewRun.ts` | A workflow that has never run still gets a REAL preview: genuine `WorkflowRunEvent` objects folded by the real reducer into the real slice, at any moment on a scrubber (`adopt={false}`, so zero network). The only invented text says what it is ("Sample preview — what X produced appears here"), never plausible-looking output. |
| Builder: the preview | `builder/PreviewPane.tsx` | Binds to the newest **completed** run when one exists (a failed run teaches an author nothing), else the sample. LOUD RECOVERY: if a past run's history never arrives within 5s it says so and falls back, rather than leaving a page reading "Not started" forever. Picking a screen winds the sample to the moment that screen is live AND its own steps are busy. |
| Surface renderer | `components/RunSurfaceView.tsx` | Renders a config over a run: trigger-resolved visibility (`appearOn`/`hideOn`, empty states), pages with auto-advance (manual tab choice wins until a LATER page's trigger fires), mobile single column by `mobileOrder ?? (y,x)`. **Layout is a FLOW, not the literal Grafana grid** (2026-08-18): `w` picks a span in a 12-column flow, `(y,x)` is the order, `h` is a MINIMUM height. The fixed 30px rows forced every readout into a ~240px porthole with its own scrollbar — live writing had nowhere to be read. `hideRunStatusCards` / `hideProgressRails` let a host that renders those better (RunStage) suppress the built-in copies. The flow only ever grows — zero page shift. |
| Exit-test page | `app/(dev)/demos/workflow-runtime/page.dev.tsx` | Pick → run → watch; run id rides `?run=` so mid-run refresh re-adopts and resumes. |

## Invariants (violating any of these is a defect)

1. **No bespoke stream rendering.** Lane content enters Redux ONLY through the canonical
   accumulator + `appendChunk`; surfaces read ONLY `requestId`-keyed selectors /
   `MarkdownStream` / `LiveRunDisplay` / kind components. (ESLint `matrx/no-bespoke-stream-renderer`.)
2. **The lane budget is load-bearing.** Never stream every node: workflows are designed for
   20–100 nodes (PLAN §4.2). Tracked tier is unlimited; streamed tier is bounded; promotion is
   viewer-driven (`ensureLane`).
3. **One flush timer per run tree.** Never reintroduce a per-lane/per-stream timer.
4. **`invocationKeyOf` is the only lane identity.** Fan-out siblings are separate invocations;
   the wire's `node_stream` deltas carry `node_id` only, so a FAN-OUT node's deltas stay in the
   TRACKED tier (single-target invocation, one bounded copy) — no lane is opened for fan-out
   (a root lane registers to no invocation and sibling lanes can receive no content; both
   burned budget on invisible panes) until the server grows per-invocation stream identity.
5. **Cursor discipline:** `after_seq` only, monotonic, shared by SSE and poller; ephemeral frames
   never advance it.
6. **A refresh never re-streams tokens.** Replay rebuilds node states + outputs (including
   `metadata.__ir` at-rest envelopes); mid-stream nodes resume from the ≤4KB heartbeat tail.
   Do not "fix" this by widening the server emitter — the durable outcome is the content truth.
7. **Child adoption is bounded** (depth 3 / 10 runs) and shares the parent's lane budget.
8. **Lifecycle verbs live in `useWorkflowRunControls` only** — no surface calls the endpoints
   directly.
9. **Triggers fire monotonically (R2).** Live phases regress (retry, resume) but a fired
   trigger never unfires — resolution reads the slice's `sticky` facts, never live phase alone.
10. **The pump never refetches.** `record_update`/`resource_changed` frames become bounded
   per-run signals + revisions in the slice; consumers subscribe via `useRunRecordSignal` and
   refetch themselves (side effect colocated with its consumer).
11. **A spinner is never the whole state of a step.** Every step that is working shows its real
   signal (its `node_progress` line, its tools, its engine phase) or, failing that, the honest
   working state — never an empty box. Synthetic sub-steps are the guaranteed FLOOR and are never
   removed; they must also never be the only thing on screen.
12. **Ring appends are idempotent.** `activity` and `emissions` are the only APPEND-shaped state in
   the slice; every other path SETS. A re-adoption refolds the whole durable log with
   `replay: true` (dedup bypassed by design), so appends ride the `appendedThroughSeq` watermark.
   Without it, opening a run twice printed the entire activity feed twice.
13. **Transports stop at terminal.** SSE ends via the `end` frame; the poller stops on the
   terminal run event — a finished run never keeps polling.

## Doctrine

- **Reuse-first:** consumed, not rebuilt: `activeRequests` + `StreamBlockAccumulator` +
  `MarkdownStream`/`LiveRunDisplay`/`KindInstanceRender` (rendering), `callApi` (HTTP), the
  studio's transport logic (ported — the studio is Vite/Zustand in another repo, so a port, not
  an import; the generated event types landed 2026-08-17 — see the row above).
- **Not internal-only:** this IS the product surface users get for workflow runs; the demo page
  is the exit test, not the product.
- **StreamProfiler** (`utils/stream-profiler.ts`) is gated off by CAPS constant — the global
  one-request singleton was a measured hazard for N concurrent lanes.

## Change Log

- 2026-08-18 — Warning activity now consumes aidream's bounded
  `{code,user_message,level,recoverable}` JSON summary directly. The old regex path remains only
  for legacy server frames that sliced full WarningPayload JSON mid-string.

- 2026-08-18 — **the Study Pack surface's deliverable page changed intent, and its forcing
  test caught up.** "Study Pack v1" grew a persisted collection tier (`flashcard_items` →
  `flashcard_set`, `quiz_mcq_items`/`quiz_free_response_items`/`quiz_fill_in_blank_items` →
  `quiz_set` → `study_pack_set`), and the stored surface row (c797a1c1…) was re-authored to
  match: the `pack` page no longer renders one `final` readout over the `show` node, it renders
  TWO persisted readouts side by side — `final-flashcards` (node `flashcard_set`) and
  `final-quiz` (node `quiz_set`), 12×12 each. `deliverableNodeId` stays `show` (the page still
  activates on `deliverable:ready`); what changed is WHAT the finished pack shows — the two
  structured sets a learner actually uses, not the terminal render node. The live row is the
  source of truth and this was deliberate, so `surface/__tests__/study-pack-surface.test.ts` was
  refreshed to pin it: the verbatim config (now 11 readouts) AND the `STUDY_PACK_DEF` skeleton,
  which had drifted far worse than the config — it was missing 9 real nodes and all 32 edges,
  so "every readout source names a real node" was being checked against a definition that no
  longer existed. The test was not weakened; it is stricter now that the skeleton is real.

- 2026-08-18 — **the live run experience rebuilt** after Arman's verdict ("ugly and terrible",
  "treats you like an idiot who's waiting", "none of the excitement of the podcast page"). The
  failure was presentational and INFORMATIONAL, not structural: the slice/adapter/lanes were
  untouched except to stop throwing truth away.
  - **The wire's truth was being discarded.** `node_stream` markers (`phase` / `tool` / `warning`)
    reached `applyNodeStreamMeta` and only `lastStreamKind` survived — for a plain agent/LLM node
    those markers are the ONLY mid-node signal aidream emits, which is exactly why a four-minute
    run could show nothing but a spinner. The slice now keeps a bounded `activity` ring
    (`ACTIVITY_MAX`) fed by those markers plus `node_progress`, node lifecycle with real durations,
    emissions and child links; `startedAtTs` records the ENGINE's start so a refresh doesn't
    restart the clock. `components/run/activity-copy.ts` is the ONE place the wire's quirks become
    sentences (bare tool names; bare phase labels; warning payloads that aidream `json.dumps`
    then hard-slices at 200 chars, so they are usually invalid JSON — parsed leniently, never
    shown as a blob). Two aidream-side defects found while tracing this are spun off, not
    swallowed: the tool-event lifecycle field is read under the wrong key so every tool frame is
    an indistinguishable bare name with its human message dropped, and warning deltas need the
    same summary treatment `record_update` already got.
  - **The stage.** `components/run/RunStage.tsx` composes what the podcast studio proved: a hero
    naming every deliverable from frame zero, a journey rail carrying every step of the DEFINITION
    (not just the ones the run has reported), the activity feed beside it, the authored readouts
    wide enough to read, and deliverables appearing as their real kind components. New `(core)`
    routes: `/workflows/[id]` and the run permalink `/workflows/runs/[runId]`.
  - **Layout.** The literal 24-col Grafana grid became a 12-column FLOW honouring the same
    authored `pos` (`w` → span, `(y,x)` → order, `h` → minimum height). The fixed 30px rows were
    what forced streamed writing into a ~240px porthole. The builder contract is unchanged and
    additive-only (`hideRunStatusCards`, `hideProgressRails`, `deriveDefaultSurfaceConfig`).
  - **Failure is first-class.** `explainRunFailure` gained an optional one-click `action`; the
    education COPPA refusal (a known product gate, not a bug) reads as a task with a door to the
    Family page instead of a raw error string.
  - Defects fixed during the live watch: activity/emission rings double-appended on re-adoption
    (durable replay bypasses seq dedup by design → `appendedThroughSeq` watermark); an attached but
    EMPTY lane rendered an empty pane over a settled step's real output; the progress sentence
    printed twice; `quiz_set` read as "Quizs".
  - `ElapsedTime` promoted to `components/official-candidate/elapsed-time/` — one clock, shared
    with the podcast generator.
  - **An agent step showed what it cost us, not what it produced.** `output_kind` on an
    `ai.agent.start` node is `agent_result` — a registered, ACTIVE kind with NO `kind_component` —
    so the generic viewer printed the run ENVELOPE: the verbatim system prompt, the model id and
    the token bill, in the box a learner was waiting on. `KindInstanceRender` gained an optional
    `unroutableFallback` (rendered only once routing SETTLES on "no component exists", so it stays
    the ONE place that decides whether a kind has a component), and `agent-run-output.ts` is now
    THE reader for an agent node's result. Building the real `agent_result` component is spun off,
    not swallowed — the fallback stops firing by itself the moment that lands.

- 2026-08-18 — **the builder was rebuilt from scratch** at `/workflows/[id]/design` after
  Arman tested the old one and rejected it outright ("no alignment, no consideration of how a
  human would interact with this"). `components/SurfaceBuilder.tsx` and
  `components/SurfaceLayoutPreview.tsx` are DELETED — with them went the drag-to-place grid,
  the x/y/w/h steppers, the raw trigger-id dropdowns, and the absence of any preview. The
  replacement lives in `builder/**` (rows above) and holds the paradigm: **build on the left,
  see the real thing on the right.** Coordinates are no longer expressible in the UI at all —
  a screen is an ordered list of panels with a named width, packed onto the 24-column grid by
  a pure packer, which is what makes alignment structural rather than a thing an author can
  get wrong. Two defects were fixed on the way: `saveSurfaceConfig` now returns
  `saved | conflict | refused | gone` instead of calling an RLS refusal a "conflict" (a
  readable row still at the expected version cannot have lost a CAS race — it was refused,
  and saying "someone else saved this" was a lie the old builder told); and
  `surface/service.ts` gained `listRecentRuns` so the preview can bind to real data. The demo
  page's Builder tab is now a door to the route, not a second lesser copy.
- 2026-08-17 — Phase 5 podcast proof: "Podcast Episode v1" shipped as LIVE data — a
  `workflow.definition` (f6d0e4b2… — io.user_input brief form → the registered
  `podcast.episode.generate` host action wrapping the SAME pipeline as the product's
  Generate Episode button → output.to_frontend) + its authored surface
  (`workflow.runtime_surface` d2b9c7a4… — brief / making-with-synthetic-rail / persisted
  deliverable pages), pinned by `surface/__tests__/podcast-surface.test.ts`, which also
  pins the generated run-start form (5 fields incl. the quick-test toggle). Zero new code.
- 2026-08-16 — Phase 5 first proof: the Study Pack authored surface shipped as LIVE data
  (`workflow.runtime_surface` c797a1c1… on "Study Pack v1" — 3 auto-advancing pages, rails
  with synthetic sub-steps, four streaming writer readouts, persisted deliverable page),
  pinned by `surface/__tests__/study-pack-surface.test.ts` (parse/validate/trigger-vocabulary
  forcing test over the verbatim stored config).
- 2026-08-16 — Phase 4 complete: the generated run-start form (`surface/run-form.ts` pure
  derivation from `io.user_input` nodes' `data.config.fields` → `components/RunStartForm.tsx`
  → submitted as `node_inputs`, the RunWorkflowRequest contract); demo shows it before
  Run/Run-step-by-step when a workflow collects inputs. "file" fields are an honest v1 text
  input (universal file-picker integration tracked in the handoff).
- 2026-08-16 — Phase 4 core + review fixes: `startStepRun` + `executeNode` verbs on the ONE
  controls hook; `nodeActionReadiness` (sticky-aware upstream-dependency derivation); the
  action readout is REAL — verb button unlocking on readiness, auto mode firing once on the
  waiting→ready edge with a live toggle; `InterruptCard` renders a schema-driven form from
  `schema_hint` (flat object schemas; tolerant fallback to text, `default_answer` prefilled).
  Bugbot fixes: sticky completion mirrors the aggregate "settled" verdict exactly (never
  stamps on failures; evaluated on completed AND skipped) and viewport promotion is
  single-invocation only (a fan-out sibling lane can never receive content).
- 2026-08-16 — Phase 3 pump + adversarial-review fixes: `record_update`/`resource_changed`
  frames parse into bounded per-run signals with coarse + per-table revisions
  (`parseSignalDelta`, `applyRunSignal`, `useRunRecordSignal`; run-level frames no longer
  dropped; server emits parseable summaries — aidream `workflow_events.py`). Eleven
  adversarial findings fixed: fan-out streams stay tracked-tier single-target (no invisible
  root/sibling lanes), `disposeRun` releases `laneRequestId` (no dead LiveRunDisplay
  shadowing outputs), viewport promotion re-attaches when invocations appear, duplicate
  `node_started` can't re-open a settled lane, the poller stops on terminal run events,
  triggers are monotonic via slice `sticky` facts, tracked-tier meta batches on a 100 ms
  coalescing timer, lane creation seeds from the flushed tail, mobile ordering never mixes
  explicit/derived scales, child summary maps run status to icon/label.
- 2026-08-16 — Phase 2 tail: drag-to-place layout preview in the builder
  (`SurfaceLayoutPreview` over `applyPlacement`); surface metadata (name /
  audience / profile) editable in the builder and saved in the same CAS write;
  R9 compact child-run render (child's own compact surface, summary+expand
  fallback); real "table" multi-run mode on `MatrxDataTable`; viewer-driven
  lane promotion (`useViewportLanePromotion` → `ensureLane` with text-tail
  seeding); `describeSource` shared in `surface/config.ts`;
  `selectRunDefinitionId` selector.

- 2026-08-16 — Phase 1 initial build: types, transport (SSE+poller), workflowRuns slice +
  selectors, lane manager (budget + shared flush), adoptWorkflowRun adapter (replay + live +
  child runs), trigger points, hooks, zero-config board, demo page, StreamProfiler gate.
- 2026-08-16 — Review fixes (PR #149 Bugbot): absent `visibility.empty` now reads as
  "placeholder" in `RunSurfaceView` (the builder omits the key for that choice — only explicit
  "hidden" collapses the box, zero page shift); `Readout.prefer` is now threaded through
  `ReadoutView` into `InvocationBody`, so "persisted" renders the settled output even while a
  lane is attached.
- 2026-08-16 — Phase 2 surface renderers: extracted shared `readout-parts.tsx` from the board;
  added `ProgressRailReadout` / `ReadoutView` / `RunSurfaceView`; slice gained
  `childRunsByNode` (subgraph_run_linked node→child map) + selectors
  `selectChildRunIdForNode` and `selectNodeAggregatePhases`.
- 2026-08-18 — the dead-run defect class closed after Arman's morning test: `RunErrorCard`
  (readout-parts) renders a failed/errored run's structured error + failing-step names on the
  Surface AND the Board (it used to sit at "Not started" forever); the progress rail shows the
  definition's human step labels via `definitionNodeLabels` (RunSurfaceView export); the board
  hides the transport chip on terminal runs; `fetchRunDefinitionId` (surface/service) lets a
  `?run=` deep link / refresh restore the workflow it was started from. Server halves in the
  same push: Study Pack v1 gained its `materials` io.user_input node (the run form now exists
  for it), and aidream's run-start routes accept callApi's body-injected `organization_id`
  (AcceptsInjectedScope + resolve_effective_organization_id — org-less runs made every agent
  step refuse).
