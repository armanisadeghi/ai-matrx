# Workflow Runtime UI — the surface where workflows RUN

**status:** planned — research complete, plan awaiting Arman's review of decision points
**canonical plan (cross-repo, read it first):** `common-docs/systems/workflow-runtime-ui/PLAN.md`

One line: a generic, user-designed (later AI-designed) live run surface for workflows in this
repo — the podcast studio run experience, generalized. Every node streams into its own
requestId lane (`MarkdownStream` + kind components render everything), a grid-slot layout maps
nodes to placed display units with placeholder/appear-on rules, manual actions light up when
step-mode `input-status` says a node is ready, and the whole thing rehydrates from durable
`workflow.*` rows on refresh.

## What this repo owns (Phases 1–6 of the plan)

1. **The Run Stream Adapter** (the crux, a new execution-system primitive): one multiplexed
   workflow SSE (`GET /runs/{id}/events/stream` + `?after_seq=` poller twin) demuxed into a new
   `workflowRuns` slice + per-node `activeRequests` rows keyed
   `(node_id, dispatch_id, item_index, attempt)`, so the canonical rendering pipeline works
   unchanged. Port the studio's transport hooks (`use-run-event-stream.ts`,
   `use-canvas-run-poller.ts`, `use-restore-active-run.ts`) and invocation aggregation.
2. **`features/workflow-runtime/`**: runtime shell (grid engine extended from
   `lib/layout/galleryLayout.ts` with authored placements, desktop+mobile), display-unit
   renderers, generalized progress rail with configurable synthetic sub-steps (podcast's
   `useStageDisplay.ts` pattern, made config), placeholder primitives, HITL interrupt form,
   run-form start, lifecycle controls, and the simple builder UI.
3. **Surface config storage** (pending D1 in the plan): definition-scoped table following the
   `workflow.node_data_slot` precedent — never `node.data` (definition_hash contamination).
4. **Data plumbing beyond streams**: `record_update`/`resource_changed` → signal→refetch
   (skills `lastIngestAt` shape), Supabase realtime backstop (`useRunListRealtime`,
   SSE-convergence pattern from `usePageRunsRealtime`).
5. **Platform hardening for many-lane pages**: `RUN_SET_MAX_ENTRIES` strategy, StreamProfiler
   singleton gating, shared flush scheduler, bounded `rawEvents`/`timeline`.
6. **Acceptance test**: rebuild the podcast run surface on this system.

Server-side enabling work (kinds adoption, autogen→web, generated event types) is aidream's
half: `aidream docs/handoffs/workflow-runtime-ui-server.md`.

Required reading before building: `features/agents/docs/LIVE_RUN_RETENTION.md`,
`features/agents/docs/STREAMING_SYSTEM.md`, `features/content-ir/FEATURE.md` (both laws),
`features/marketing/seo/keyword-research/useKeywordResearch.ts` (the adoption exemplar).
