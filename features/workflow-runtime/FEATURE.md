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
| Event vocabulary mirror | `types.ts` | Hand-maintained TS mirror of `matrx_graph/types/events.py` (19 durable events) + aidream's ephemeral `node_stream` frame. `invocationKeyOf(nodeId, dispatchId, itemIndex)` is THE lane identity — `node_id` alone is never a completion key. Generated shared types are the tracked follow-up (aidream handoff). |
| SSE client | `transport/sse.ts` | Fetch-based (EventSource can't set Authorization). Handles CRLF, partial frames, comment heartbeats. |
| Run event source | `transport/run-event-source.ts` | SSE preferred + poller fallback on ONE `after_seq` cursor; claim-on-first-frame; 20s stall detector; ported from workflow-studio's proven pair. `node_stream` frames carry no seq and never advance the cursor. |
| **The slice** | `redux/workflow-runs.slice.ts` | Tree-aware (`byRunId`, children auto-attach on `subgraph_run_linked`). Every node TRACKED: invocation states with fan-out aggregation, costs, progress, emissions, work sets, interrupt, capped text tails. |
| Selectors | `redux/workflow-runs.selectors.ts` | Memoized, per-property, stable-empty. `selectNodeAggregate` derives the aggregate phase (a node is settled only when `invocations.length >= expectedCount`). |
| **Lane manager** | `redux/lane-manager.ts` | THE LANE BUDGET (`MAX_STREAMED_LANES = 12`): every node tracked, only a bounded set streamed. ONE shared flush timer for all lanes (never one per stream). Lanes are real `activeRequests` rows + canonical accumulators; retention rules apply (`LIVE_RUN_RETENTION.md`). |
| **The adapter** | `redux/adopt-workflow-run.thunk.ts` | `adoptWorkflowRun({runId})`: attach → run row + heartbeat tails → durable replay (`?after_seq=`, paged) → live follow → lane routing → child runs (depth ≤ 3, count ≤ 10, shared budget). Token history is unreplayable BY DESIGN — refresh resumes from tails + durable outcomes. |
| Trigger points | `trigger-points.ts` | Ruling R2: named, enumerable moments derived from the DEFINITION (`run:*`, `node:<id>:*`, `edge:<id>:traversed` — client-DERIVED, the engine emits no edge events — `deliverable:ready`, `mark:<name>`), resolved against run state. Pure module. |
| Hooks | `hooks/useWorkflowRun.ts`, `hooks/useWorkflowRunControls.ts` | Adoption is refcounted per runId (two watchers share one adapter). Controls are the ONLY lifecycle verbs — start/pause/resume/cancel/answer-interrupt/retry/skip via `callApi`. |
| Zero-config board | `components/WorkflowRunBoard.tsx` | Tier 0 presentation: status rows for every node, lanes via `LiveRunDisplay variant="bare"`, settled kind-checked output via `KindInstanceRender`, interrupt answer card, recursive child boards (`adopt={false}` on children — the parent adapter already follows them). |
| Shared readout parts | `components/readout-parts.tsx` | THE one per-invocation body (`InvocationBody`: lane → `LiveRunDisplay`, settled kind → `KindInstanceRender`, textTail, JSON, error) + `PhaseIcon` / `PHASE_LABEL` / `InterruptCard` — consumed by the board AND every Phase 2 readout; never fork a second copy. |
| Surface config | `surface/config.ts` | The Run Surface document (R1/R6/R7): 24-col grid, readout sources (node/group/childRun/progressRail/static/action), pages, visibility; tolerant parse + strict validate. |
| Progress rail | `components/ProgressRailReadout.tsx` | The generalized podcast rail: per-node rows from selectors + authored SYNTHETIC sub-steps (randomized 2.2–5.5s cadence, last held until the node leaves "running", snap-all-done), 99%-cap progress bar until the run is terminal. Animation state is presentation-local — refresh restarts it by design. |
| Readout renderer | `components/ReadoutView.tsx` | One readout's bare content per source kind; multi-run modes stack/latest/table (table = the canonical `MatrxDataTable` over invocations — item/status/output/duration, every column sorts + filters); childRun renders the child's OWN authored compact surface when one exists (R9 — `getDefaultSurface(childDefId, {profile:"compact"})` → nested `RunSurfaceView adopt={false}`), else a compact status summary with an expandable full board; static markdown via `MarkdownStream` content mode. Node and rail labels use the resolved spec type with a human fallback, never expose graph-local IDs as dead-end UI text. Visible node readouts promote running lane-less invocations via `useViewportLanePromotion` (IntersectionObserver → `ensureLane`, seeded with the tracked tail). |
| Layout preview | `components/SurfaceLayoutPreview.tsx` | The builder's drag-to-place miniature (dnd-kit core): pixel delta → grid delta → caller runs `applyPlacement`. Position only; sizes stay on steppers — the preview never re-implements layout rules. |
| Surface renderer | `components/RunSurfaceView.tsx` | Renders a config over a run: trigger-resolved visibility (`appearOn`/`hideOn`, placeholder empty states), pages with auto-advance (manual tab choice wins until a LATER page's trigger fires), 24-col desktop grid / mobile single column by `mobileOrder ?? (y,x)`, interrupt card above the grid. The grid only ever grows — zero page shift. |
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
11. **Transports stop at terminal.** SSE ends via the `end` frame; the poller stops on the
   terminal run event — a finished run never keeps polling.

## Doctrine

- **Reuse-first:** consumed, not rebuilt: `activeRequests` + `StreamBlockAccumulator` +
  `MarkdownStream`/`LiveRunDisplay`/`KindInstanceRender` (rendering), `callApi` (HTTP), the
  studio's transport logic (ported — the studio is Vite/Zustand in another repo, so a port, not
  an import; the generated-types package is the tracked de-duplication).
- **Not internal-only:** this IS the product surface users get for workflow runs; the demo page
  is the exit test, not the product.
- **StreamProfiler** (`utils/stream-profiler.ts`) is gated off by CAPS constant — the global
  one-request singleton was a measured hazard for N concurrent lanes.

## Change Log

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
