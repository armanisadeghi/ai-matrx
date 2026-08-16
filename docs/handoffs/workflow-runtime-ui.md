# Workflow Runtime UI — the surface where workflows RUN

**status:** Phase 1 (the plumbing) SHIPPED 2026-08-16 — Phases 2+ open
**canonical plan (cross-repo, read it first):** `common-docs/systems/workflow-runtime-ui/PLAN.md`
(all rulings R1–R12 settled; Readouts, Grafana layout model, dual-source, trigger points)
**code contract:** `features/workflow-runtime/FEATURE.md`

One line: a generic, user-designed (later AI-designed) live run surface for workflows —
the podcast studio run experience, generalized. Every node streams into its own requestId lane
(`MarkdownStream` + kind components render everything), a Grafana-model grid places readouts
with trigger-point-driven visibility, and everything rehydrates from durable `workflow.*` rows.

## Shipped (Phase 1)

`features/workflow-runtime/` — the Run Stream Adapter (`adoptWorkflowRun`: replay + SSE/poller
live follow + child runs), the tree-aware `workflowRuns` slice with fan-out invocation
aggregation, the lane manager (12-lane budget, one shared flush timer, canonical accumulator
lanes), the trigger-point registry, lifecycle-controls hook, the zero-config
`WorkflowRunBoard`, and the exit-test page `/demos/workflow-runtime` (`?run=` refresh
survival). StreamProfiler gated off (CAPS). 51 jest tests; repo typecheck + eslint clean.

## Remaining (this repo)

1. **Phase 2 — surface config + shell + builder** (plan §7): the Grafana-model grid engine
   (extend `lib/layout/galleryLayout.ts` with authored `{x,y,w,h}` placements + vertical
   compaction), readout display modes (R8 stack/latest/table), display profiles (R9), the
   `workflow.runtime_surface` config table (R1 — definition-scoped, direct supabase-js), the
   builder UI, pages/tabs via trigger points, lazy-render↔lane-budget wiring
   (`ensureLane` on viewport entry — the hook API already exists).
2. **Phase 3 — data plumbing:** `record_update`/`resource_changed` → the skills-style
   signal→refetch pump; Supabase realtime backstop (`useRunListRealtime` pattern);
   `link_kind`/`link_id` doors.
3. **Phase 4 — actions + HITL surface:** step-mode `input-status` "ready" action readouts,
   automate toggles, schema-driven interrupt form (the Phase 1 card is textarea-only), run-form
   start dialog (generated, port the studio's seeding rules).
4. **Phase 5 — parity proof:** Study Pack surface, then the podcast rebuild (the acceptance
   test), then research-lite.
5. **Known Phase-1 limits to close:** `node_stream` deltas carry `node_id` only, so fan-out
   siblings multiplex onto the node's root lane (server contract addition tracked in the aidream
   handoff); `useWorkflowRunControls` casts its callApi configs (`as never`) — replace with
   fully typed per-verb calls; demo list parsing is tolerant-shaped pending the generated
   list response type.

Server half (kinds adoption, autogen→web, generated event-types package):
`aidream docs/handoffs/workflow-runtime-ui-server.md` + `workflow-node-kinds-gap.md`.
