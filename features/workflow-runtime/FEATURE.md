# Workflow Runtime — the surface where workflows RUN

**Status:** Phases 1–5 SHIPPED and production-proven — plumbing, Run Surfaces, the run stage, the
designer, actions/HITL. 263 runs in the last 14 days across 92 definitions. Remaining work is
doors that were never built, not plumbing (cluster state:
`common-docs/systems/workflows/workflow-runtime/STATE.md`; cross-repo work order:
`common-docs/systems/workflows/workflow-runtime/HANDOFF.md`). AI-authored surfaces are still ahead.
**Cross-repo system-of-record:** `common-docs/systems/workflows/workflow-runtime/STATE.md` — the
rulings (R1–R12, now §2.8/§2.10 there), the scale target (20–100 nodes, nested runs), and the
phase plan live THERE; this doc is the code contract for what exists in this repo. Read STATE.md
before extending this feature.

**Wire contract for a node's output and a run's result:**
`/Users/armanisadeghi/code/common-docs/systems/content-ir-system/RUNTIME_WRAPPER_WIRE.md` — every
`node_completed` carries `wrapper` (a self-describing `node_outcome`: which workflow, which node,
timing, kind verdict, the data kind nested under `output`) and `GET /runs/{id}` returns `result` (a
`run_result` nesting one per terminal node). Payloads are elided — `output_ref` names the frame
field to rehydrate from. Read it before touching how a run's output reaches the screen in ANY repo.

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
| Render-block frames | `transport/render-block-frames.ts` | Reassembles the SLICED `render_block` frames of the ephemeral channel: a server render block is a full snapshot that routinely exceeds the wire's 8000-byte pg_notify cap, so it arrives as ordered slices sharing a `frame_id`. A set that never completes, or one that does not parse, is DROPPED — half a JSON document never reaches a renderer. Contract: `../../../common-docs/systems/content-ir-system/STREAMING_PARTIAL_KINDS.md` §7b. |
| Run event source | `transport/run-event-source.ts` | SSE preferred + poller fallback on ONE `after_seq` cursor; claim-on-first-frame; 20s stall detector; ported from workflow-studio's proven pair. `node_stream` frames carry no seq and never advance the cursor. |
| **The slice** | `redux/workflow-runs.slice.ts` | Tree-aware (`byRunId`, children auto-attach on `subgraph_run_linked`). Every node TRACKED: invocation states with fan-out aggregation, costs, progress, emissions, work sets, interrupt, capped text tails. |
| Selectors | `redux/workflow-runs.selectors.ts` | Memoized, per-property, stable-empty. `selectNodeAggregate` derives the aggregate phase (a node is settled only when `invocations.length >= expectedCount`). |
| **Lane manager** | `redux/lane-manager.ts` | THE LANE BUDGET (`MAX_STREAMED_LANES = 12`): every node tracked, only a bounded set streamed. ONE shared flush timer for all lanes (never one per stream). Lanes are real `activeRequests` rows + canonical accumulators; retention rules apply (`/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/LIVE-RUN-RETENTION.md`). A lane has exactly ONE producer of blocks: `pushRenderBlock` stores the SERVER's blocks (typed partial kinds included) through the same `upsertRenderBlock` the chat stream uses, and a lane whose text arrives marked `block_shadowed` stops feeding its own accumulator — two producers over one region render the answer twice, under two sets of block ids. |
| **The adapter** | `redux/adopt-workflow-run.thunk.ts` | `adoptWorkflowRun({runId})`: attach → run row + heartbeat tails → durable replay (`?after_seq=`, paged) → live follow → lane routing → child runs (depth ≤ 3, count ≤ 10, shared budget). A terminal event triggers one final run read because `GET /runs/{id}` derives the `run_result`; without it, the live page cannot receive the result that a refresh sees. Token history is unreplayable BY DESIGN — refresh resumes from tails + durable outcomes. |
| Trigger points | `trigger-points.ts` | Ruling R2: named, enumerable moments derived from the DEFINITION (`run:*`, `node:<id>:*`, `edge:<id>:traversed` — client-DERIVED, the engine emits no edge events — `deliverable:ready`, `mark:<name>`), resolved against run state. Pure module. |
| Hooks | `hooks/useWorkflowRun.ts`, `hooks/useWorkflowRunControls.ts` | Adoption is refcounted per runId (two watchers share one adapter). Controls are the ONLY lifecycle verbs — start/pause/resume/cancel/answer-interrupt/retry/skip via `callApi`. |
| **THE LIVE RUN EXPERIENCE** | `components/run/RunStage.tsx` | The surface a person actually watches, composed like the podcast studio: hero + promise → journey rail + activity feed → authored readouts → deliverables. Hoists the authored progress rails into the always-visible journey (`hideProgressRails`) and renders the failure/interrupt cards itself (`hideRunStatusCards`), so nothing is drawn twice. Falls back to `deriveDefaultSurfaceConfig` when a workflow has no authored surface. |
| **The catalog** | `browse/` → `app/(core)/workflows/all/page.tsx` | `/workflows/all` on the CANONICAL entity-list shell (`lib/entity-list`) — not a bespoke grid. Config in `browse/listConfig.tsx`; rows from `public.wfx_list_scoped` read DIRECT via supabase-js (`browse/service.ts`), never through the Python server. Table-first with every column sorting AND filtering server-side, card + dense views, Mine / My Orgs / Shared / Public with true server counts, relevance-ranked search. ONE `ItemMenuConfig` builder (`browse/workflowActionRegistry.tsx`) feeds the table kebab, the card kebab, the dense-row kebab and right-click, so the three-drifting-action-lists failure that hit agents cannot happen here. |
| **Discovery — the inbox + the runs lists** | `discovery/` → `app/(core)/workflows/{waiting,runs}/page.tsx`, `app/(core)/workflows/[id]/runs/page.tsx` | Census #38/#39. `/workflows/waiting` is THE "waiting on you" inbox over `GET /runs/waiting` — `interrupted` AND `awaiting_input` in one list (a surface listing one and not the other is wrong), every row opening its run. `/workflows/runs` + `/workflows/[id]/runs` are the runs lists over `GET /runs`, on the canonical `MatrxDataTable` over ONE bounded page. 🚨 **ONE announce subscription for all of them**: `useRunAnnouncements` refcounts a module-singleton `startAnnounceChannel` over `GET /runs/stream`, so four mounted surfaces share one socket — and **never Supabase Realtime**, since `workflow.run` is not in the publication (a Postgres-Changes subscription there delivers nothing and reports no error). Frames are ephemeral with no replay, so a listed run's status patches in place while anything else refetches, and every reconnect refetches the snapshot to close the hole. 🚨 **The inbox never answers anything** — a row opens the RUN, where `InterruptCard` and the resumable start form already live; a second answer form here would be a second renderer of the same question. Pure halves (`waiting.ts`, `runs.ts`) are tested; `waiting.ts`'s generated-schema aliases + `__tests__/waiting-contract.test.ts` are the tripwires that make a type regen against a stale production loud instead of silent. |
| **The front door** | `app/(core)/workflows/page.tsx` → `features/auth/components/module-landing/landings/WorkflowsLanding.tsx` | `/workflows` is the PUBLIC marketing page for the product (module-landing-pages doctrine): a guest never hits a login wall, a signed-in visitor is redirected to `/workflows/all`. Built on the shared `<ModuleLanding>` — no hero clone — and registered in `MODULE_LANDING_DIRECTORY`, which is what puts it on `/features` and now, via `app/sitemap.xml/route.ts`, in the sitemap. The old placeholder's destination-preserving login bounce survives as the landing's `signInDestination` (`loginHref('/workflows/all')`). |
| Catalog RPCs | `migrations/wfx_list_scoped.sql` | `wfx_list_scoped` / `wfx_list_scope_counts` / `wfx_list_facets` / `wfx_bucket_matches`, hand-written from the template in `lib/list-scope/FEATURE.md`. Owner column is `created_by` (agents use `user_id`); `iam.permissions.resource_type` is `'workflow'`. Relevance comes from `public.mtx_search_score` — the GENERIC scorer, not a fourth copy of `agx_search_score`: it reproduces agx's tiers exactly on the shared parity fixture (12/12 MATCH), with the per-feature extras passed as `p_extra_300` / `p_extra_100` arrays. |
| **Sharing — the card** | `migrations/wfx_card.sql`, `migrations/wfx_duplicate.sql` | Workflows use the AGENT sharing model verbatim (Arman, 2026-08-20): **anything you can view, you may duplicate and run.** `workflow.card` is a view over the definition — the public face — gated by `card_visibility`, which is INDEPENDENT of the body's `visibility`. `wfx_duplicate_definition` / `wfx_duplicate_version` mirror `agx_duplicate_agent` / `agx_duplicate_version`, including the `iam.has_access_for(..., 'viewer')` gate; they carry no `p_as_system` because workflows have no builtin tier. The card is a PROJECTION of the workflow, not a second entity — `platform._enforce_entity_is_table` forbids registering a view as an entity, so there is **no card-only per-person grant**; broadcast reach is `card_visibility`. |
| Run status vocabulary | `run-status.tsx` | THE one place a `workflow.run.status` becomes words and an icon (`RUN_STATUS_LABEL`, `RUN_STATUS_PHASE`, `runStatusLabel`, `RunStatusChip`). There were two disagreeing copies before it — `ReadoutView`'s and the old catalog's ("completed" was "Done" in one and "Finished" in the other) — and the list page would have been a third. Both now import from here. |
| Run routes | `app/(core)/workflows/[id]/page.tsx`, `app/(core)/workflows/runs/[runId]/page.tsx` → `components/run/WorkflowRunPage.tsx` | One body, two doors: `/workflows/[id]` sets up + runs (run id rides `?run=`), `/workflows/runs/[runId]` is the run's permalink (THE DOOR LAW). Each resolves the other, so a refresh always lands back on the live run. `(core)` conformant: `RouteHeader`, body `h-full overflow-hidden`, one inner scroll. |
| Hero + the promise | `components/run/RunHero.tsx` | Status, elapsed (from the ENGINE's start, not the attach), cost, step count, and the chip row naming every deliverable **from frame zero** — the ProductionTeaser job, generalized. Fixed heights: nothing below it moves as state changes. |
| Journey rail | `components/run/RunJourney.tsx` | Every step of the DEFINITION present immediately (not just the ones the run has reported), each with its author's label, its own icon, and what it will produce. Three layers while a step runs: its freshest REAL signal, the authored synthetic sub-steps (the guaranteed floor — never removed), the phase. Both retire on completion; the full trace lives in the feed. |
| **Activity truth-feed** | `components/run/RunActivityFeed.tsx` + `components/run/activity-copy.ts` | The workflow twin of the podcast's `ResearchActivityFeed`: the actual tools called, the engine's own phases, `node_progress` sentences, per-step durations. `activity-copy` is the ONE place wire markers become sentences. Tool and warning markers are parseable JSON summaries; bare tool names and mid-string warning JSON remain legacy fallbacks. Failure/warning rows carry canonical Copy / Copy-for-AI controls. Renders nothing when the backend said nothing. |
| **Mid-run emissions** | `components/run/RunEmissions.tsx` | What a `output.to_frontend` step ("Show on Screen") deliberately put on screen while the run continued. Renders `run.emissions` in arrival order through `features/workflow-emit`'s `DbEmitRenderer` — the authored component when `component_ref` resolves, the generic body otherwise. The slice folded these events from day one and the activity feed logged a "delivered" line for each, but the CONTENT had no home until 2026-08-19 (90 real emissions across 85 runs had rendered nowhere). Each emission carries the WHOLE wire event — `presentation`, `kind`, `kindOk`, and `metadata` (the `__ir` envelope, stored whole) alongside mode/payload/componentRef/title — and hands all of it to the renderer; nothing on this side inspects or strips it. 🚨 **Import ONLY `DbEmitRenderer` / `surface` / `types` from that feature** — anything else drags `@babel/standalone` around its `next/dynamic` boundary (the D115 shape); guarded by `features/workflow-emit/__tests__/emit-bundle-boundary.test.ts`, which runs per-PR via `pnpm test:workflow-runtime` (its jest paths cover `features/workflow-emit` too). |
| **Delivered — declared slots + unclaimed emissions** | `kind-emissions/` (`DeliveredStream`, `ShowcaseSlot`, `EmissionRender`, `emission-routing.ts`, `result-schema.ts`, `useResultSchema.ts`) | 🚨 **THE shipped path since 2026-08-28.** SPEC-workflow-ui-contract §3 as one component family. `useResultSchema` reads `GET /workflows/{id}/result-schema` — what the workflow PROMISES — so every deliverable slot is reserved **before the run reports anything**; `splitByPresentation` lifts the ONE staged reveal into the page-centered `ShowcaseSlot` (newer replaces, and a replaced showcase does not fall back into the stream); `DeliveredStream` owns both the slots and the leftover emissions so the dedupe is structural. **The dedupe key is widened**: a declared deliverable with NO declared kind claims any emission from its own node — the literal `(node_id, kind)` key can never match for `output.to_frontend`, which is the exact node class the rule exists for. `EmissionRender` is the router: kind set and `kind_ok is not False` → `KindInstanceRender` (`component_ref` deliberately IGNORED); otherwise `DbEmitRenderer`. 🚨 It inherits the D115 import boundary — only `DbEmitRenderer`/`surface`/`types` from `features/workflow-emit`, guarded by `emit-bundle-boundary.test.ts`. |
| Deliverables — the degrade only | `components/run/RunDeliverables.tsx` | The pre-contract shelf: every step declaring an `output_kind`, ghosted as "coming up" then becoming a real panel. On `RunStage` it now renders **only when the result schema could not be read** — never beside `DeliveredStream`, which is already drawing those nodes. 🚨 An in-flight fetch is NOT an unreadable one: LOADING holds the delivered section, because painting the degrade and then re-sorting into the slots is the page shift the reserved slots exist to end. |
| **Run controls** | `components/run/RunControlBar.tsx` + `run-controls.ts` (+ the per-step verbs in `RunJourney`) | Census #34. Pause / Resume / Stop / Cancel now on the run page, Try again / Move past it on a step that stopped — all wiring the verbs `useWorkflowRunControls` already carried and nothing called. `run-controls.ts` is the pure, tested decision half. **A verb a status forbids is DISABLED WITH ITS REASON, never hidden** — a control that vanishes teaches nobody why. Both stop verbs confirm through `confirm({...})`; Stop is `graceful` (finish the step, keep its output), Cancel now is `immediate`. `paused`/`interrupted`/`awaiting_input` all read as parked, but only `paused` resumes — the other two want an ANSWER, which is the interrupt card's verb. |
| Step presentation | `components/run/node-presentation.ts` | Pure derivation of label / family / lucide icon / declared `output_kind` from the definition. `resolveNodeIdentity` reads Studio-authored `data.spec_type` / `data.category`, then falls back to the engine's canonical `node.type` so programmatic workflows get live readouts too. This is what makes "what to look forward to" possible before a single node starts. |
| Agent output reader | `agent-run-output.ts` | THE reader for an agent-run envelope (`agent_result`) — `readAgentRunOutput` gives what the agent PRODUCED (`content`, the §6 ordered kind-instance list, plus `final_text` / `structured_output`), `readAgentRunFacts` gives the numbers ABOUT the run (duration, turns, tool calls, cost, tokens, model, the conversation id as a door). `messages` is in NEITHER result type, so no consumer can leak the verbatim prompt by forgetting to filter it. Pure, importless. Consumers: the `agent_result` kind bridge (`features/content-ir/kinds/agent-result.ts` — what THE component renders everywhere), `readout-parts.tsx`, `AgentAssignmentsDemo`, `features/masterwork/service.ts`. A fourth ad-hoc `final_text` reader is a defect. |
| Agent content list | `components/AgentContentList.tsx` | THE renderer for the §6 `content` channel — each entry through `KindInstanceRender` in the SERVER'S order, never re-sorted, never merged, never fenced. An entry naming no kind takes the platform floor (`StructuredValueView`) directly. Two hosts, one implementation: `AgentResultBlock` (the kind component, so every surface gets it) and `SettledOutputBody` (the componentless-kind fallback). |
| Failure card | `components/run/RunFailureCard.tsx` + `run-failure-explanation.ts` | Failure as a first-class state: plain-language headline, the failing step by its author's name, the one next action, the technical cause one tap away, and canonical Copy / Copy-for-AI controls built by `components/run/run-copy.ts`. Route-open failures, per-node failures, and activity failures use the same payload family; the default mirrors rendered text + hero KPIs, and the AI menu adds raw JSON and an investigation prompt. **Since 2026-08-20 `explainRunFailure` resolves from the STRUCTURE the engine persists** (`cause` + `step_id`/`step_label`/`field`/`expected`/`got`/`technical` in `workflow.run.error`), not from regexes over English — pass it the WHOLE error record, never `.message`. The per-field headline is generated from `step_label` + `field`, so **no workflow is ever named in this module**; a new cause goes in the server's `Cause` vocabulary + the client's `CAUSE_COPY` map, never in a new regex. `LEGACY_PATTERNS` is the old table, legacy-only, do not extend. It carries an optional one-click `action` — the education COPPA gate routes to the page that clears it, `run_stranded` says WE dropped the run. THIS IS THE ONLY failure-explanation module; never add a second, never write a bespoke failure string in a component. Cross-repo contract: `/Users/armanisadeghi/code/common-docs/systems/workflows/workflow-runtime/RUN_FAILURE_CONTRACT.md`. |
| Zero-config board | `components/WorkflowRunBoard.tsx` | Tier 0 presentation: status rows for every node, lanes via `LiveRunDisplay variant="bare"`, settled kind-checked output via `KindInstanceRender`, interrupt answer card, recursive child boards (`adopt={false}` on children — the parent adapter already follows them). |
| Shared readout parts | `components/readout-parts.tsx` | THE one per-invocation body (`InvocationBody`) + `PhaseIcon` / `PHASE_LABEL` / `InterruptCard` — consumed by the board AND every readout; never fork a second copy. Resolution order: a lane **that has carried something** → `LiveRunDisplay`; settled kind → `KindInstanceRender` (with an `unroutableFallback` that reads an agent-run envelope through `agent-run-output.ts` for any OTHER componentless kind — `agent_result` itself now has THE component and no longer reaches it); textTail; settled JSON → the canonical viewer via `MarkdownStream`; error; still working → the honest working state with its live progress line. **An empty lane never wins** — the adapter opens one for every non-fan-out node including nodes that never stream a token, and treating it as truth rendered an empty pane over the output the step had actually produced. |
| **Triggers — running without a person** | `triggers/` → `app/(core)/workflows/[id]/triggers/page.tsx` | 🚨 **NOT `trigger-points.ts`.** A **trigger** (`workflow.trigger`) is what STARTS a run — a cron schedule, an inbound webhook, or (2026-08-28) a **data-change event** (`kind='event'`: a watched table's row transition durably enqueues a fire; product capture's item close is the first). A **trigger point** (ruling R2) is a named MOMENT INSIDE a run that UI binds visibility to. Same word, unrelated systems; do not let them touch. Event triggers currently render (DatabaseZap card, watched table, pause/delete; no bare "Try it now" — an event fire needs the row's inputs, so retry lives on the owning surface, e.g. product capture's Reprocess). **Creating one from this UI is a follow-up**: it needs `pnpm sync-types` against a backend serving the new `/triggers` OpenAPI (event_source on the create body), then an event pane in `NewTriggerForm`. Until then event triggers are seeded server-side (`aidream scripts/seed_product_capture_intake_v1.py`). |
| Trigger client | `triggers/useWorkflowTriggers.ts` | THE one path to `/triggers*`, the twin of `useWorkflowRunControls` — every verb a `callApi` config typed against the generated OpenAPI paths. **Never build a scheduler here:** aidream's `CronWatcher` runs inside the deployed workflow worker and is what actually fires. `listFires` returns `null` (not `[]`) on a failed read — "never ran" and "couldn't check" are opposite answers. |
| Plain-language recurrence | `triggers/recurrence.ts` | PURE `Recurrence` ↔ cron. Our user does not write cron, so the UI authors *every weekday at 9:00 AM* and this derives the expression; `fromCron` reads it back so an edit shows plain language. Anything unrecognized (or hand-typed) round-trips as `advanced`, **verbatim** — a person's own expression is never rewritten. Cron evaluation is NOT reimplemented: `lib/scheduler-client/next-due.ts` (validate + next-N fires, timezone-aware) is the platform primitive every preview uses. Monthly is capped at day 28 so a short month can never silently skip. |
| Trigger default inputs | `triggers/default-inputs.ts` | 🚨 **FLAT, not per-node, and that is load-bearing.** aidream's `_create_trigger_run` passes `default_inputs` through as the run's BROADCAST inputs and never writes `metadata._settings.node_inputs`; the engine merges broadcast inputs into every source node, so flat keys reach an `io.user_input` node exactly as a hand-started run's values do. Nesting by node id would arrive as one unknown field and park the run. `collidingInputKeys` names the one case flat loses (two user-input nodes sharing a key) so the surface says so instead of guessing. |
| **Run start form** | `components/RunStartForm.tsx` → `served-form/` (`ServedRunForm`, `useServedRunForm`, `served-input.ts`) | THE start surface, and the one place that decides HOW inputs are asked for. A workflow's inputs are ONE declared surface compiled server-side and served by `GET /workflows/{id}/run-form` (common-docs `systems/workflows/INPUT-SURFACE.md`); `RunStartForm` holds that fetch and renders `ServedRunForm` whenever the surface is genuinely served. Only `input_sources` on that path may claim provenance `human`, and a 409 `inputs_required` reaches the FORM as the server's own gap list — never a toast. **The legacy `deriveRunForm` derivation survives ONLY behind that guard, with a visible banner saying which branch is on screen** (a server predating the compiled surface is a version skew, not a shape of workflow); it is never a silent fork. |
| Trigger input UI | `triggers/components/TriggerDefaultInputs.tsx` + `components/RunFormFieldControl.tsx` | The workflow's OWN run form (`deriveRunForm`) authored as "what should it work with, every time" — the field control is shared with `RunStartForm`, never a second input authoring path. Warns when a REQUIRED field is empty: nobody is present when a schedule fires, so a missing answer is a run that parks, not a prompt. |
| Webhook secret | `triggers/components/NewTriggerForm.tsx` → `WorkflowTriggersPage` | Write-once by contract: the server stores it encrypted and marks it `exclude=True` on every response, so **no read path can return it**. Minted with browser crypto, sent once, shown once, held only in component state — never Redux, storage, or a URL. A card can therefore only say a secret is set; building a reveal would promise what the platform deliberately cannot do. |
| Fire history | `triggers/components/TriggerFireHistory.tsx` | `GET /triggers/{id}/fires` — THE DOOR LAW: every fire that produced a run opens it at `/workflows/runs/[runId]`. A failed fire shows the server's own reason; a failed READ says so and keeps the last run as a door, and is never rendered as the reassuring "it hasn't run yet". |
| Surface config | `surface/config.ts` | The Run Surface document (R1/R6/R7): 24-col `pos`, readout sources (node/group/childRun/progressRail/static/action), pages, visibility; tolerant parse + strict validate. `deriveDefaultSurfaceConfig` builds a real surface from the DEFINITION for a workflow nobody has authored one for (steps that think or declare an `output_kind` become full-width readouts). Additive only — the builder writes the same document. |
| Progress rail | `components/ProgressRailReadout.tsx` | The generalized podcast rail: per-node rows from selectors + authored SYNTHETIC sub-steps (randomized 2.2–5.5s cadence, last held until the node leaves "running", snap-all-done), 99%-cap progress bar until the run is terminal. Animation state is presentation-local — refresh restarts it by design. |
| Readout renderer | `components/ReadoutView.tsx` | One readout's bare content per source kind; multi-run modes stack/latest/table (table = the canonical `MatrxDataTable` over invocations — item/status/output/duration, every column sorts + filters); childRun renders the child's OWN authored compact surface when one exists (R9 — `getDefaultSurface(childDefId, {profile:"compact"})` → nested `RunSurfaceView adopt={false}`), else a compact status summary with an expandable full board; static markdown via `MarkdownStream` content mode. Node and rail labels use the resolved spec type with a human fallback, never expose graph-local IDs as dead-end UI text. Visible node readouts promote running lane-less invocations via `useViewportLanePromotion` (IntersectionObserver → `ensureLane`, seeded with the tracked tail). |
| **The builder** | `builder/RunSurfaceBuilder.tsx` + `app/(core)/workflows/[id]/design/page.tsx` | Build left, watch right — the agent-apps `LiveBuilder` paradigm applied to a run page. The right pane mounts the REAL `RunSurfaceView`; there is no wireframe, no miniature, no mock. Loads definition + default surface, holds one draft, CAS-saves, and offers a workflow with no surface the generated one already rendered beside the button. `(core)` contract: body `h-full overflow-hidden`, chrome via `RouteHeader`. |
| Builder: plain language | `builder/vocabulary.ts` | THE TRANSLATION LAYER — the one place the document becomes sentences and back. Steps get a human role from their spec type (`ai.agent.*` → "An AI writes this, live"); trigger points become a two-part question (a moment kind + which step) instead of a 70-entry dropdown; an unrecognized trigger round-trips as "a moment set up elsewhere". No UI string names a readout, a source kind, or a trigger id. |
| Builder: layout model | `builder/layout-model.ts` | ORDER + NAMED WIDTH, never coordinates. A screen's panels are an ordered list; `packScreen` flows them left-to-right and wraps, deriving every x/y, so misalignment is not expressible. Heights stay exactly as authored until the person changes them. `normalize` reproduces the live Study Pack positions byte-for-byte (pinned by `builder/__tests__/layout-model.test.ts`), and every function spreads, so unknown config keys survive a round trip. |
| Builder: the sample run | `builder/sample-run.ts`, `builder/useSamplePreviewRun.ts` | A workflow that has never run still gets a REAL preview: genuine `WorkflowRunEvent` objects folded by the real reducer into the real slice, at any moment on a scrubber (`adopt={false}`, so zero network). The only invented text is the explicit label "Sample output", never plausible-looking output. |
| Builder: the preview | `builder/PreviewPane.tsx` | Binds to the newest **completed** run when one exists (a failed run teaches an author nothing), else the sample. LOUD RECOVERY: if a past run's history never arrives within 5s it says so and falls back, rather than leaving a page reading "Not started" forever. Picking a screen winds the sample to the moment that screen is live AND its own steps are busy. |
| Surface renderer | `components/RunSurfaceView.tsx` | Renders a config over a run: trigger-resolved visibility (`appearOn`/`hideOn`, empty states), pages with auto-advance (manual tab choice wins until a LATER page's trigger fires), mobile single column by `mobileOrder ?? (y,x)`. **Layout is a FLOW, not the literal Grafana grid** (2026-08-18): `w` picks a span in a 12-column flow, `(y,x)` is the order, `h` is a MINIMUM height. The fixed 30px rows forced every readout into a ~240px porthole with its own scrollbar — live writing had nowhere to be read. `hideRunStatusCards` / `hideProgressRails` let a host that renders those better (RunStage) suppress the built-in copies. The flow only ever grows — zero page shift. |
| Lifecycle verbs | `hooks/useWorkflowRunControls.ts` | THE ONE start/step/execute/pause/resume/cancel/answer/retry/skip path. Every verb is a `callApi` config typed against the GENERATED OpenAPI paths — path, `{param}` set and body all come from `types/python-generated/api-types.ts`, so a route or field that moves on the server is a compile error here. Never reintroduce a stringly-typed `post(path, …)` helper: the casts it needed hid a real defect (a free-text interrupt answer was sent as a bare string where the engine takes an object). |

## Invariants (violating any of these is a defect)

1. **No bespoke stream rendering.** Lane content enters Redux ONLY through the canonical
   accumulator + `appendChunk`; surfaces read ONLY `requestId`-keyed selectors /
   `MarkdownStream` / `LiveRunDisplay` / kind components. (ESLint `matrx/no-bespoke-stream-renderer`.)
2. **The lane budget is load-bearing.** Never stream every node: workflows are designed for
   20–100 nodes (PLAN §4.2). Tracked tier is unlimited; streamed tier is bounded; promotion is
   viewer-driven (`ensureLane`).
3. **One flush timer per run tree.** Never reintroduce a per-lane/per-stream timer.
4. **`invocationKeyOf` is the only lane identity.** Fan-out siblings are separate invocations.
   **The server grew per-invocation stream identity (SPEC §5.2, V3-A): `node_stream` and
   `node_emitted` now carry `dispatch_id` + `item_index`**, so an ATTRIBUTED frame is keyed
   exactly (`streamInvocationKey`) and a fanned-out node renders N separable lanes
   (`RunFanOutLanes`, proven live on run `1358667d`). An UNATTRIBUTED frame — a node-level
   emitter, or a server predating the change — still lands on ONE invocation (single-target,
   one bounded copy), never all N. The heartbeat is read the same way: `_streaming_by_node`
   keys are now `node:dispatch:index`, and the legacy bare-node-id form still resolves.
   Fan-out deltas remain TRACKED-tier — the lane budget is unchanged; a sibling lane is a
   phase + tail on the rail, not a promoted content pane.
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
13. **A workflow GRAPH is never public.** `workflow_definition_body_not_public_chk` bans `public`
   on `workflow.definition.visibility` at the DB edge — the graph is the author's craft, exactly
   as an agent's prompt body is. The public face is the CARD (`card_visibility`). Anything that
   publishes a workflow writes `card_visibility`; a "make public" control that writes `visibility`
   is a defect that raises 23514. Never reintroduce a boolean `is_public` — agents deleted theirs
   deliberately.
14. **Transports stop at terminal.** SSE ends via the `end` frame; the poller stops on the
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

## Known limits

- **A trigger cannot be EDITED, only turned off or removed.** The server exposes
  `PATCH /triggers/{id}` for `is_active` alone — there is no update path for the
  schedule, the timezone, or the default inputs. Changing any of those today
  means removing the trigger and making a new one (and for a webhook, minting a
  new secret). Widening that PATCH is the fix, and it is a server change.
- **The runs lists read ONE bounded page (100 rows) and sort/filter it locally.** `GET /runs`
  has no server-side sort, filter or total, so the canonical table's column controls act on the
  page it was given, not on the corpus. Correct for a discovery surface people scan; wrong the
  day somebody needs run #400. The fix is a scoped runs RPC on the entity-list shell's contract,
  and it is a server + SQL change, not a client one.
- **`workflow.v_definition_catalog` no longer has a consumer.** The view existed so the old
  catalog could read step/run counts without shipping the `nodes`/`edges` jsonb;
  `wfx_list_scoped` computes the same facts from the same lateral, with scoping and filtering the
  view could not do. The view is left in place deliberately — per the unfinished-work alarm, an
  artifact with no runtime consumer is a decision for Arman, not something an agent retires.

## Change Log

- 2026-08-28 — **Waiting discovery does not persist logout/session-expiry 401s as incidents.**
  `useWaitingRuns` still renders the authenticated projection's refusal, but declares HTTP 401
  expected so a protected shell finishing one in-flight badge read as a guest stays control flow.
- 2026-08-28 — **The interrupt contract, the approval preset and fan-out lanes (Volley 7).**
  `interrupt/` is the new home of everything a mid-run question needs: `interrupt-view.ts`
  (pure — the §4.1 presentation block, the answer fields, the deadline copy, the provenance
  sentence), `InterruptQuestion.tsx` (the one component) and `RunDecisions.tsx` (the record).
  🚨 **The answer control is no longer a third input renderer**: it resolves through
  `resolveVariantComponent` → `VariableInputComponent`, the same ladder `ServedRunForm` walks,
  and the flat `parseInterruptFields` switch in `readout-parts.tsx` is DELETED (it was
  module-local with exactly one consumer). A `presentation: "showcase"` question is STAGED in
  `ShowcaseSlot` and OUTRANKS a showcase emission while it waits — the run is blocked on it —
  with `InterruptCard placement="panel"|"showcase"` keeping it from being drawn twice; hosts
  that pass no `placement` are unchanged. A `context` value carrying `__kind` renders through
  `KindInstanceRender` above the control. **Provenance is always shown**: `selectRunDecisions`
  reads `matrx_decision` off the settled `control.human_input` outputs, because the live card
  vanishes the instant the run resumes. 🚨 **The engine settles a RESUMED `human_input` as
  `node_skipped`, and the fold was discarding that event's `output` entirely** — a skipped
  node's output is what downstream edges receive, and for a question it IS the answer. Fixed
  in the slice; the selector reads both terminal phases. §5.2: `streamInvocationKey` +
  `heartbeatInvocationKey` key live frames by the identity the wire now carries, and
  `RunFanOutLanes` / `RunWorkSetBar` render the sibling lanes and the `work_set_progress`
  numbers that had been folded since the emitter shipped and rendered nowhere.
  **Proven live** (fixture `Approval + Fan-out Proof (no LLM)`,
  `a1c0de00-0000-4000-8000-000000000701`): run `6ffdc118` approved with a note, run `1358667d`
  paused→resumed→rejected, both themes, three lanes keyed by `dispatch_id:item_index`.
  🚨 **Open SERVER defect the walks surfaced:** `POST /runs/{id}/resume` never builds a
  `DecisionProvenance` for the authenticated human, so `stamp_decision` is skipped and a
  human's approval lands with NO `matrx_decision` — while the escalation sweeper does stamp,
  making an auto-decision better attributed than a person's. The UI says "Approved — decider
  not recorded" out loud rather than implying a person; do not soften that copy, fix the seam.

- 2026-08-28 — **Discovery exists as a surface (census #38/#39, Volley 6).** `discovery/`:
  `/workflows/waiting` is THE "waiting on you" inbox over `GET /runs/waiting` — `interrupted`
  and `awaiting_input` in ONE list, every row opening its run; `/workflows/runs` and
  `/workflows/[id]/runs` are the runs lists over `GET /runs`. All three are live off ONE shared
  `GET /runs/stream` subscription (`useRunAnnouncements` refcounts a module singleton — four
  mounted surfaces, one socket), never Supabase Realtime: `workflow.run` is not in the
  publication, so a Postgres-Changes subscription there delivers nothing and reports no error.
  A status change on a listed run patches in place; anything else refetches, because an
  ephemeral frame carries no row. The catalog's Runs count is finally a door, and the catalog
  header carries the inbox badge — **silent at zero**, since a permanent "0 waiting" chip
  trains people to stop seeing it. 🚨 **The inbox never answers anything**: a row opens the RUN,
  where the interrupt card and the resumable start form already live. `awaiting_input` was in
  the status union but in neither vocabulary map, so every surface that met one drew the idle
  circle — fixed in `run-status.tsx`. Two tripwires guard the fresh `/runs/waiting` contract
  against a type regen run against a not-yet-deployed production (it happened twice during this
  build, and the second time the hook was stubbed out to compile): generated-schema aliases in
  `discovery/waiting.ts` and `__tests__/waiting-contract.test.ts`.

- 2026-08-28 — **The shipped run surface adopted the three proven contracts (Volley 5).**
  `RunStartForm` renders through `ServedRunForm` whenever `/run-form` serves a real input
  surface, keeping `deriveRunForm` as the one explicit, banner-marked fallback branch;
  `RunStage` reserves its deliverable slots from `/result-schema` before the run reports
  anything, stages the one showcase in `ShowcaseSlot`, and hands the rest to
  `DeliveredStream` with the widened dedupe; the run page grew its controls (census #34).
  `keepableDeliverables` was **deleted**, not deprecated — its `output.to_frontend`
  exclusion was the workaround the dedupe rule replaced, and the two cannot both survive.
  Kept on purpose (R14): `deriveRunForm` / `seedRunFormValues` / `RunFormFieldControl`
  still have live consumers in the trigger surface; their sweep is its own wave.
  Browser-proven end to end on the production run page against the no-LLM fixture
  `3ffe233a-8ad6-43be-b1ee-42c232713bd4` — slots reserved pre-run, kind routing for both a
  kinded and a kindless emission, showcase replacement, zero duplicated cards, and
  pause / resume / cancel walked on live runs.

- 2026-08-28 — **Event triggers render.** `TriggerKind` gains `"event"` (`parseTrigger`
  keeps `event_source` instead of coercing the kind to manual), `TriggerCard` shows the
  data-change card (DatabaseZap icon, watched table, pause note) and gates the webhook
  address block to `kind="webhook"` and "Try it now" to webhook/manual. Creation from
  the UI is a tracked follow-up pending `pnpm sync-types` against a deployed backend
  (see the Triggers row above).
- 2026-08-27 — **`node_emitted` stopped dropping four fields, and the emit guard reached CI.**
  `WorkflowRunEmission` and the `node_emitted` branch of `applyEvent` folded only the eight
  fields that `features/workflow-emit/types.ts` hand-mirrored; the server had been sending
  twelve. The emission now carries `presentation` (`panel` / `showcase`), `kind`, `kindOk`, and
  `metadata` — the last **stored whole**, because it holds the verified Content-IR envelope under
  `__ir` and the `__kind` law forbids stripping anything on the way in. Each has a floor meaning
  "not stated" (`"panel"` / `null` / `null` / `null`), so a server that predates the kind-aware
  emitter reads as silent rather than as a fabricated kind. `RunEmissions` passes all four to
  `DbEmitRenderer`. **Nothing renders differently yet** — routing a kinded emission to its kind
  component is a later phase; this is the plumbing that stops the data being thrown away. The
  root cause was the hand mirror itself, now deleted (`workflow-emit/FEATURE.md` invariant 6:
  the wire type is re-exported from `types/python-generated/workflow-events.ts`). Two new slice
  tests pin the fold and the older-server floor; the fold-through test was falsified against a
  stubbed reducer before being kept. Separately, `pnpm test:workflow-runtime` now runs
  `features/workflow-runtime features/workflow-emit`, so `emit-bundle-boundary.test.ts` — the
  D115 guard — is a per-PR gate instead of a test nobody ran. CI step names and the nine gates in
  `CLAUDE.md` are unchanged.
- 2026-08-22 — **`/workflows` is a real marketing page, not a redirect.** The reserved route now
  serves the public pitch for the run product to guests (signed-in visitors still land on
  `/workflows/all`), built on the shared `<ModuleLanding>` and registered in the landing
  directory. The copy sells only what shipped — the library, the promise chips, THE PLAN, the
  live activity feed, real deliverable components, run permalinks, and the run-page designer —
  in the Expert's language (no "node", "stream", "kind", or "readout"). Three platform fixes
  rode along, since they were the same door: `ModuleLanding` gained a `signInDestination` prop
  so EVERY landing offers a destination-preserving "Already have an account? Sign in"
  (`loginHref`), the two guest conversion components stopped hand-writing the read-only
  `returnUrl` alias and now build their CTAs with `loginHref`/`signUpHref`, and the sitemap
  derives every module landing from `MODULE_LANDING_DIRECTORY` instead of listing none of them.
  Verified signed-out in the browser at desktop and 390px, light and dark.

- 2026-08-22 — Added canonical shell-header clearance to the workflow bake-off picker so its search field and instructions no longer render underneath the transparent AppShell header.
- 2026-08-21 — **Programmatic workflows stream into visible readouts, terminal results land
  without refresh, and every failure is copyable.** `resolveNodeIdentity` now falls back from
  Studio-only node metadata to canonical `node.type`, and `deriveDefaultSurfaceConfig` uses the
  same reader, so agent-authored and compiled definitions no longer derive an empty stage while
  their nodes stream. The adapter performs one final `GET /runs/{id}` after a terminal event to
  hydrate the derived `run_result` that was previously visible only after refresh. Route-open,
  run, node, activity-warning, and activity-failure states now use the canonical two-control
  `CopyButtons` surface; `run-copy.ts` keeps rendered error text and hero KPIs in the primary
  payload and offers raw JSON plus an investigation-prompt variant. Pinned by
  `programmatic-definition-renders.test.ts` and `run-copy.test.ts`.

- 2026-08-21 — **Typed partial kinds now render on the run page.** A workflow agent's
  answer used to reach a run page as raw text only: the server's block-stream scope never
  engaged for a detached run (its node emitter is not a `StreamEmitter`), AND the step
  handed its runner the pre-scope context so the scope was bypassed even when attached.
  Both fixed server-side; here, `transport/render-block-frames.ts` reassembles the sliced
  frames and `lane-manager.ts::pushRenderBlock` puts the completed block onto the node's
  lane through the SAME `upsertRenderBlock` the chat stream dispatches — so `BlockRenderer`,
  `resolveProvisionalKindRender` and `MarkdownStream` render a workflow node exactly as they
  render a chat turn. No new renderer, no new parser, no new slice state; every wire-boundary
  rule moved into ONE funnel (`execution-system/utils/inbound-render-block.ts`) that
  `processStream` was rewired onto rather than copied from. Proven by replaying a verbatim
  capture of a real run's wire (`__tests__/real-run-partial-kinds.test.ts`): a `quiz_set`
  partial fills 4 → 10 questions, then produces no provisional render once it completes.
  Mechanism: `../../../common-docs/systems/content-ir-system/STREAMING_PARTIAL_KINDS.md` §7b.

- 2026-08-21 — **The §6 content channel stopped being dropped on the floor.**
  `matrx-ai` has always sent `content` on the agent-run envelope
  (`graph_nodes/shared.py#_extract_content`): the response as an ORDERED LIST OF
  KIND INSTANCES, each carrying its own `__kind`. The client read only
  `structured_output` and `final_text`, so the list reached the browser and was
  discarded — a reader got flat text where the server had sent typed,
  renderable shapes. `readAgentRunOutput` now returns `content`, the
  `agent_result` kind declares and bridges it, and the new `AgentContentList`
  renders every entry through its own kind component in the server's order
  (`AgentResultBlock` and `SettledOutputBody` both delegate — one
  implementation). Precedence: a non-empty `content` WINS; `structured_output`
  / `final_text` remain the path when it is absent or empty, which is the
  NORMAL case for a schema-bound answer that named no kind (`shared.py:346`) —
  never an error, never a blank screen. An unroutable or unnamed entry lands on
  `StructuredValueView`, never a JSON dump. Pinned by
  `features/content-ir/__tests__/agent-result-content-channel.test.tsx`
  (populated AND empty paths). **Open, aidream-side:** the kind's stored
  `emitted_json_schema` still has no `content` property — it is derived from
  `AiExecutionResult` and must be regenerated there, not hand-written here.

- 2026-08-20 — **Run failures consume the persisted structured contract.**
  `explainRunFailure` receives the full `workflow.run.error`, resolves `cause`
  through `CAUSE_COPY`, and uses `step_label` plus field details without naming
  a workflow. `LEGACY_PATTERNS` remains legacy-only. Cross-repo contract:
  `common-docs/systems/workflows/workflow-runtime/RUN_FAILURE_CONTRACT.md`.

- 2026-08-20 — **Workflows became shareable on the agent model.** `card_visibility` +
  the `workflow.card` view + `workflow_definition_body_not_public_chk` (`wfx_card.sql`);
  `wfx_duplicate_definition` / `wfx_duplicate_version` mirroring the `agx` pair
  (`wfx_duplicate.sql`); `wfx_list_scoped`'s **Public** scope repointed from `d.visibility`
  (which the new invariant makes impossible — the tab was empty BY CONSTRUCTION) to
  `card_visibility`, which it now also RETURNS so the client can explain and manage why a row is
  public. `browse/service.ts`'s `duplicateWorkflow` was a client-side read-then-insert that
  copied the SOURCE's `organization_id` and `visibility` onto the copy; it now calls the RPC and
  the old path is deleted. Fixed on the way, and it was **already broken for agents** since
  2026-08-12: `get_share_capabilities` preferred `visibility` unconditionally, so the ShareModal's
  Public tab wrote a column the DB refuses — it now excludes any column banned by a
  body-not-public CHECK, detected from the constraint rather than an allowlist. The Duplicate
  action already existed in `browse/workflowActionRegistry.tsx` and needed no second list.
  Live-verified: a stranger sees a public card but NOT the body; a card-only stranger cannot
  duplicate; a viewer-level grantee can, and the copy lands in THEIR org, private, reputation
  reset.

- 2026-08-21 — **ui-dense wave-2 bake-off entry: the operations-desk run page** at
  `/workflows/bakeoff/dense-2/[id]` (`bakeoff/dense-2/**`) — a candidate
  PRESENTATION only, consuming the canonical data layer unchanged (adoption,
  selectors, `InvocationBody`, `DbEmitRenderer`, `RunFormFieldControl`,
  `activity-copy`, `useWorkflowRunControls`). Three fixed panes: a plan ledger
  with progressive condensation (contiguous finished stretches fold into one
  "N steps done · time" line), ONE aimed auto-following focus pane — the only
  streamed lane — and an activity rail; a facts strip and a promises strip on
  top. Intake, live run and delivered result share the same geometry. Deleted
  or promoted when the bake-off is judged. Fixed while building it: the shared
  free test workflow 31318fb7… failed every run (its "Measure it" expression
  used a generator expression the matrx-graph sandbox forbids); its expression
  was repaired in the DB so every wave-2 entry can verify live.

- 2026-08-21 — **ui-reimagine wave-2 bake-off entry: The Commission** at
  `/workflows/bakeoff/reimagine-2/[id]` (`bakeoff/reimagine-2/**`) — a
  candidate PRESENTATION only, consuming the canonical data layer unchanged
  (adoption, selectors, `InvocationBody`, `DbEmitRenderer`,
  `RunFormFieldControl`, `activity-copy`, `run-status`). The run page as a
  commissioned-work dossier: manifest rail (deliverable promises from frame
  zero + a route that progressively condenses finished stretches into
  "n steps done"), ONE aimed focus window auto-following the freshest work
  (only the focused single-invocation step is promoted to a lane), delivered
  chapters pre-declared and filled by real kind components, and the wire
  (activity truth-feed + engine-start clock + quiet-stretch honesty line).
  Deleted or promoted when the bake-off is judged. Found while verifying
  (server-side, not fixed here): the free test workflow
  31318fb7-5e1a-4554-b174-ca3960d72961 now errors on EVERY run — its
  `data.transform` expressions are refused by the engine sandbox
  ("Disallowed call target"), across all wave-2 designers' runs.

- 2026-08-20 — **ui-refine wave-2 bake-off entry** at
  `/workflows/bakeoff/refine-2/[id]` (`bakeoff/refine-2/**`) — a candidate
  PRESENTATION only, consuming the canonical data layer unchanged (adoption,
  selectors, `InvocationBody`, `DbEmitRenderer`, `RunFormFieldControl`,
  `activity-copy`, `deriveRunForm`). Parcel-tracking-with-Linear-craft: promise
  strip from frame zero, condensing plan rail ("n steps done" folds), ONE aimed
  focus panel (the only streamed lane; auto-follows, aimable, "Back to live"),
  activity feed, delivered section. `[id]` accepts a definition OR run id; dead
  ids fail fast with a plain card. Verified live: Bakeoff Test Run full
  lifecycle incl. errored runs, Hopkins Copy Desk 21 steps live with mid-run
  refresh, 21-step replay. Deleted or promoted when the bake-off is judged.
  Found on the way (fixed in DATA, not the page): the shared Bakeoff Test Run
  fixture had a half-finished repair — edge `e3` still mapped `words` after the
  `measure` expression dropped it, so every run died at "Write the summary".

- 2026-08-20 — **ui-reimagine bake-off entry: the Courier run page** at
  `/workflows/bakeoff/reimagine/[id]` (`bakeoff/reimagine/**`) — a candidate
  PRESENTATION only, consuming the canonical data layer unchanged (adoption,
  selectors, `InvocationBody`, `DbEmitRenderer`, `RunFormFieldControl`,
  `activity-copy`). One fixed-shape page: marquee + promise strip, folding
  route line, a camera window that follows the work (camera-driven
  `ensureLane`, 1–3 lanes), wire ticker. Deleted or promoted when the
  bake-off is judged. Found while building it (spun off, not fixed here): a
  watchdog-force-failed run replays as "running" forever because `seedRunRow`
  ignores a terminal ROW status once replay stamped `statusTs`.

- 2026-08-20 — **schedules and webhooks got a door: `/workflows/[id]/triggers`.**
  The entire trigger stack (CRUD, the webhook fire endpoint, the `CronWatcher`
  inside the deployed workflow worker) had been live and **never once used** —
  `workflow.trigger` held zero rows because nothing in any client could reach it.
  Built on what already existed: `deriveRunForm` + the extracted
  `RunFormFieldControl` for default inputs, `lib/scheduler-client/next-due.ts`
  for cron validation and next-fire previews, `callApi` typed against the
  generated OpenAPI paths, `ConfirmDialogHost` for removal. Doors added on the
  run page header and in `buildWorkflowMenu`.
  **Proven end to end on production:** a schedule authored in plain language
  fired on its own at 12:19 AM PDT (trigger `1b8a8032-d963-43f6-8fff-905778394bda`),
  produced run `2e4943c7-539b-4798-989e-064b5f825a89`, which completed 4/4 steps
  and renders at its permalink — reached from the card's "Open the last run".
  **Three real server defects surfaced by being the first consumer, all fixed in
  aidream in the same session:** `GET /triggers/{id}/fires` 500'd on every call
  (`filter_items` compiled `limit`/`order_by` as column filters); every webhook
  trigger was unfireable (`encrypt_value` bytes written to a TEXT column, so the
  correct secret always 403'd as "legacy/undecryptable"); and `GET /triggers`
  returned every trigger on the platform to unauthenticated callers.

- 2026-08-19 — **`useWorkflowRunControls` is fully typed against the generated OpenAPI paths.**
  The Phase-1 generic `post(path, …)` helper and its six `as never` casts are gone; each verb now
  passes a literal `ApiCallConfig<path, "POST">` to `callApi`, so the path, its `{param}` set, the
  request body and `?mode=` are all checked against `types/python-generated/api-types.ts`.
  **The casts were hiding a real bug:** `answerInterrupt` typed `resumeValue` as `unknown` and cast
  it, and the free-text branch of the Pause & Ask form sent a bare STRING — the engine's
  `ResumeRunRequest.resume_value` is `dict[str, Any] | None`, so every free-text answer would have
  been refused 422. It now travels as `{ answer }`, which is what `control.human_input` reads.
  Verified: `pnpm type-check` clean, 125 workflow-runtime tests green, a real Study Pack run
  started from `/workflows/{id}` and completed 24/24 ($0.24), and pause / resume-paused /
  cancel?mode=graceful / step-runs each accepted live by the server on real runs.
- 2026-08-18 — **THE FLOOR + `Readout.prefer` decides WHEN, never whether.** Settled output with
  no kind component now renders as a human document through `StructuredValueView`
  (`components/official/structured-value/`) instead of `JSON.stringify` in a ```json fence —
  `JsonBody` / `SettledOutputBody`, plus settled agent text that IS a JSON document, which is
  parsed once and handed to the same floor. Full doctrine, and the measurement that forced it
  (2 of 23 Study Pack steps rendered as components, 19 as JSON):
  [`features/content-ir/FEATURE.md`](../content-ir/FEATURE.md) § THE FLOOR.
  **`prefer` semantics fixed in the same pass:** the lane and the durable tail used to outlive the
  RUN, so a finished run left the flashcards agent's raw streamed JSON on screen while a page
  REFRESH of the same run — which has no lane to hold — showed a proper table. `prefer` now only
  chooses WHEN the settled document takes over ("persisted" = the moment that step settles,
  "live" = when the run ends); a terminal run always hands over. Verified live end-to-end: a fresh
  run swapped raw stream → filterable table at DONE, with no reload.
  `RunDeliverables` also passes `variant="bare"` — its card was already the chrome.
- 2026-08-18 — **the last two raw-JSON panels of a live Study Pack run became real
  components.** "Your materials" (the Preparing screen, on screen from the opening seconds of
  EVERY run) rendered the ingest node's chunk array — `content_hash`, `chunk_index`,
  `source_offset_end` — at a learner who had pasted their own textbook; "Study notes" (the
  Writing screen) rendered the notes document as one unbroken line of braces. Both shapes were
  MEASURED against live `workflow.node_outcome` rows and neither fitted an existing kind, so both
  got their own: **`ingested_sources`** (python-owned, schema =
  `IngestedContent.model_json_schema()`, declared at the SPEC level on
  `docproc.ingest.from_media_refs` so every workflow using that node benefits) and
  **`study_notes`** (ts-owned, converter-emitted). The declined alternatives are recorded because
  re-attempting them costs a drift log on every run: `bulk_result` requires `items[]` and forbids
  everything else, and `structured_info` is `additionalProperties:false` over exactly
  `title`+`sections` with sections keyed `heading`/`body`/`items`.
  **The notes declaration cannot sit on the parse node** — `ai.util.parse_llm_json` wraps its
  result under `value` and `parsed_json` is closed — so `study_pack_v1` gained a `study_notes`
  step (`data.transform`, expression `inputs['notes']`, which spreads the dict flat onto the
  root) exactly like the `flashcard_set` / `quiz_set` nodes, and the stored surface row
  (c797a1c1…) repoints its "Study notes" readout at that node with `prefer: "persisted"`.
  Verified end to end on run `e606cd60`: `output_kind_ok=true` on both
  `ingest`→`ingested_sources` and `study_notes`→`study_notes`.
  🚨 **The Writing screen's other three panels — Flashcards, Practice quiz, Lesson scripts — still
  render raw JSON**, for a DIFFERENT reason: they read their `ai.agent.start` node, whose output is
  the `agent_result` envelope, so `InvocationBody` falls through to the JSON viewer. Flashcards and
  quiz already have kinded nodes to repoint at (`flashcard_set` / `quiz_set`); lesson scripts has
  no kind yet.

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
- 2026-08-18 — **the catalog moved to `/workflows/all` and was rebuilt on the canonical
  entity-list shell** (Arman's ruling after testing production). `/workflows` is now RESERVED for
  a future marketing page and redirects signed-in visitors to the catalog (signed-out ones go
  through `loginHref`, so the destination survives sign-in); `/workflows/[id]` and
  `/workflows/[id]/design` are untouched. What the bespoke card grid could not do and the shell
  does: scopes with true server counts, every column sorting AND filtering over the whole result
  set, relevance-ranked search, card/dense/table views with persisted style, inline edit, and one
  action list per row. **The visual defect that prompted this** — the search field flush against
  the shell's glass header (measured: input top 44px, header bottom 44px, zero clearance) — is
  gone because the shell owns its own `pt-[calc(var(--shell-header-h)+0.5rem)]`; measured 56px of
  clearance after. Three doors that were dark got lit on the way: `entityRegistry.workflow`
  gained its `hrefFor` (the "no detail route exists" comment had outlived `/workflows/[id]` by
  months, so every workflow `EntityRef`, peek and toast door was inert), the
  `platform.shareable_resource_registry` row got its `url_path_template` back
  (`migrations/wfx_share_registry_workflow_route.sql` — emptied in the D138 sweep for the same
  stale reason, so a shared workflow's modal rendered no link), and `workflow_run` was registered
  in `FEATURE_META`, which makes 128 existing engine-stamped conversations filterable for the
  first time. The old `catalog/` directory is deleted, not shimmed.
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
