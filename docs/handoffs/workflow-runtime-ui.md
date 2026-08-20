---
status: active
updated: 2026-08-20
repos: [matrx-frontend, aidream]
vision: [/Users/armanisadeghi/code/common-docs/projects/workflow-runtime/STATE.md]
---

# Workflow Runtime — the surface where a normal person runs a workflow

**status:** open — the core product is SHIPPED and production-proven (263 runs in the last 14
days); the gaps below are doors that were never built, not plumbing that was never finished.

**🚨 CLUSTER STATE — READ FIRST:**
[`common-docs/projects/workflow-runtime/STATE.md`](/Users/armanisadeghi/code/common-docs/projects/workflow-runtime/STATE.md)
— Arman's merged vision (including the 2026-08-19 charter: workflows replace ~70% of the UI, so
**work on the primitives**), the verified state of every part, the full ordered pending list, the
question ledger, and the census. This handoff is this repo's slice of that list.

**Vision:** `common-docs/systems/workflow-runtime-ui/PLAN.md` (R1–R12 settled — read it for
mechanics, never for vocabulary).
**Code contract:** `features/workflow-runtime/FEATURE.md` (parts table, invariants, change log).
**Server half:** `aidream docs/handoffs/workflow-runtime-ui-server.md`.
**Sister cluster:** `common-docs/projects/workflows/STATE.md` — Workflows (the
BUILDING side). This cluster is the USING side; Arman drew that line on 2026-08-19.

One line: a generic, author-designed live run experience — you see what you'll get from second
zero, watch every step work with real signal, and the deliverables land as real components.

## THE UPSTREAM RULING (Arman, 2026-08-18) — the kinds MODEL is broken

`common-docs/systems/content-ir-system/WORKFLOW_KINDS_AUDIT.md`. **The runtime's rendering rests
on that model.** Nothing here re-executes the old per-node burn-down; when the audit's decisions
land, this feature consumes them.

## Open (this repo, ordered)

1. **Triggers have no door** 🚨 **#1, Arman 2026-08-19.** Schedules and webhooks are fully built
   and deployed on the server (7 endpoints + a `CronWatcher` in the running worker) and have
   **never been used once** — `workflow.trigger` and `workflow.trigger_fire` are both empty, and
   this repo has no trigger UI at all. **Chipped 2026-08-19** with the full inventory; see STATE
   §4.1. (Do not confuse `workflow.trigger` — what STARTS a run — with `trigger-points.ts`, a
   named moment INSIDE a run.)
2. **A person cannot stop their own run.** `pause` / `resumePaused` / `cancel` are wired and
   server-proven, but `WorkflowRunBoard` — the only surface rendering those buttons — is mounted
   ONLY for nested child runs (`ReadoutView.tsx:430`).
3. **There is no runs list.** `app/(core)/workflows/runs/` holds only `[runId]`, for 379 real
   runs. Build it against the server's `GET /runs/stream` run-announce channel (live, zero
   consumers) — **not** Supabase Realtime: `workflow.run` is not in the publication.
4. **151 of 154 workflows have no designed run page** — everything but Study Pack, Podcast and one
   Default falls back to `deriveDefaultSurfaceConfig`. Decide whether the derived default is good
   enough by looking at real runs (STATE §4.4, Q7).
5. **The failure experience is unset** — 133 of 379 runs ended errored or failed. Read the last 50
   before adding copy to `explainRunFailure` (STATE §4.6, Q5).
6. **`executeNode` per-node `inputs` collection UI** (Phase 4 tail) — the verb is wired, the
   input-gathering UI is not.
7. **Study-pack composite component** — the `study_pack_set` kind exists live and active; the
   deliverable page still composes `flashcard_set` + `quiz_set` by hand.
8. **Research-lite parity proof** — the last unproven surface complexity class (tabs/pages +
   DB-backed tables; PLAN Phase 6's second half).

## In flight (separate sessions — do not duplicate)

- `task_e9503c14` — agent steps stream their TOKENS onto `node_stream` (server).
- `task_fb0b4ed6` — universal Shape renderer (partial commits: `b64407336`, `a8fb617bd`).
- `task_c739e725` — the trigger door (item 1).

## Server-owned (see `aidream docs/handoffs/workflow-runtime-ui-server.md`)

Per-invocation stream identity on `node_stream` (**the FE half is already built and tested** —
`invocationKeyOf`, `stream-meta.test.ts`, `invocation-key.test.ts`; only the emitter is missing
the fields) · `result_ref` NodeSpec declaration (AWAITS ARMAN).

## Decisions Arman owes

Tracked in the cluster ledger — STATE §5, Q1–Q7. In this repo's words: ① `result_ref` ②
`ai.transcribe` naming ③ Readouts vs the UI's plain language ④ "the builder" naming two systems
⑤ what a failed run should say ⑥ who else can run a workflow you built ⑦ is the derived default
run page good enough.

## Corrected 2026-08-20 (doc convergence — do not re-open)

- ~~"`/workflows` marketing page unbuilt"~~ — **built.** `WorkflowsLanding.tsx` (165 lines) is
  wired at `app/(core)/workflows/page.tsx` with the guest / signed-in split.
- ~~"Consume `useRunListRealtime` on the first runs-LIST surface"~~ — **wrong path.** The hook is
  already consumed (`features/podcasts/studio/runs/useStudioRuns.ts`), its precondition fails
  (`workflow.run` is not in `supabase_realtime`), and the server shipped the canonical channel.
  Superseded by item 3.

## Recently shipped (compressed; details in FEATURE.md change log)

2026-08-19: `useWorkflowRunControls` typed per-verb against the generated OpenAPI paths (the 6
`as never` casts gone) — and the casts were hiding a live defect: a free-text Pause & Ask answer
was sent as a bare string where `ResumeRunRequest.resume_value` is an object.

2026-08-16/17: Phases 1–5 (adapter, slice, lanes, surfaces, drag builder, actions/HITL, Study
Pack + Podcast pinned proofs). 2026-08-18/19: run stage rebuilt (promise-first hero, full plan,
real activity feed, mid-run emissions, deliverables, humane failure card); designer rebuilt (no
coordinates, real/sample preview); permanent routes + canonical list; Study Pack run form +
projection lane onto real kinds; org fix (body scope + `X-Organization-Id`); full kind coverage
incl. `agent_result` / `ingested_sources` / `study_notes`; generated TS event types both apps;
autogen→web; server stream fixes; wrapper-law `variant="bare"`; USER-INPUT LAW fixes in
content-ir; COPPA signup age screen.
