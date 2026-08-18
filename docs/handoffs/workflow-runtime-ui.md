# Workflow Runtime UI — the surface where workflows RUN

**status:** owned (taken over 2026-08-17) — Phases 1–5 SHIPPED; tails below are the open work
**canonical plan + vision (cross-repo, read it first):** `common-docs/systems/workflow-runtime-ui/PLAN.md`
(rulings R1–R12 all settled; the vision lives THERE — §1 requirements, §4.2 scale doctrine
20–100 nodes/nested runs, the podcast acceptance bar. Never let it rot out of that file.)
**code contract:** `features/workflow-runtime/FEATURE.md` (parts table, invariants, change log)

One line: a generic, user-designed (later AI-designed) live run surface for workflows — the
podcast studio run experience, generalized. Per-node requestId lanes through the canonical
pipeline, Grafana-model grid of dual-source readouts, trigger-point visibility, rehydrates from
durable `workflow.*` rows.

## Shipped (compressed — details in FEATURE.md change log)

Phases 1–5, 2026-08-16/17: Run Stream Adapter (`adoptWorkflowRun`: replay + SSE/poller + child
runs) · tree-aware `workflowRuns` slice · 12-lane budget, one shared flush timer ·
trigger-point registry · `workflow.runtime_surface` table + `surface/config.ts` (the ONE
builder/AI config document) · layout engine + `autoLayoutSurface` · readout renderers +
progress rail with synthetic sub-steps · `SurfaceBuilder` with drag-to-place · signal→refetch
pump (`useRunRecordSignal`) · actions/HITL (step-mode verbs, readiness-gated action readouts,
schema-driven interrupt form, generated run-start form incl. canonical file picker) · two live
parity proofs pinned by tests: Study Pack (surface `c797a1c1-…`) and Podcast (definition
`f6d0e4b2-…` + surface `d2b9c7a4-…`). ~140 jest tests. Eleven adversarial findings fixed.

## Remaining (this repo)

1. **Phase 5 — research-lite parity proof**: tabs/pages + DB-backed tables surface (PLAN
   Phase 6's second half). The last unproven complexity class.
2. **Phase 3 tail**: consume `hooks/useRunListRealtime.ts` when the first runs-LIST surface
   lands (verify `workflow.run` is in the `supabase_realtime` publication first);
   `link_kind`/`link_id` doors (EntityRef) on the first surface that lists signals; first real
   pump consumer with the Study Pack surface.
3. **Phase 4 small tail**: executeNode per-node `inputs` collection UI.
4. **Phase-1 limits**: `useWorkflowRunControls` casts its callApi configs `as never` — replace
   with typed per-verb calls; demo list parsing is tolerant-shaped pending the generated list
   response type; fan-out siblings multiplex onto the node's root lane (`node_stream` deltas
   carry `node_id` only — server contract addition, tracked in the aidream handoff).
5. **Mobile patrol row**: `.matrx/patrol-reports/mobile-friendly-ui.md` flags the feature +
   demo — verify/remediate.

## Dispatched as chips (2026-08-17 — do not duplicate)

FE kind components + activation for the 4 media kinds (`task_2d094758`) · generated shared TS
event-types (replaces hand-maintained `types.ts`; cross-repo, `task_786c5371`) ·
`kind_component_autogen` → web (`task_6c3c1840`). (Ids re-fired 2026-08-18 — the first chip
generation died with an app restart before anyone started them.)

Server half: `aidream docs/handoffs/workflow-runtime-ui-server.md` + `workflow-node-kinds-gap.md`
+ `podcast-media-shapes.md`.
