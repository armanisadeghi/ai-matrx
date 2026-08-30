# Workflow Comparison — Workflow Battle

**Route:** `/workflows/battle` (`app/(core)/workflows/battle/page.tsx`).
**What it is:** Agent Battle for WORKFLOWS — pick 2–6 workflows, each at a
pinned version, lock ONE shared input set, run every arm for real money,
watch each arm's run live, judge blind, record the verdict. Server half:
`aidream/services/workflow_comparison/` (see its FEATURE.md); work order:
`common-docs/systems/workflows/HANDOFF.md` item 2; plan:
`common-docs/systems/workflows/11-workflow-battle-plan.md`.

## Architecture

- **The durable row is the state of record**: `workflow.comparison`, read
  DIRECTLY via Supabase (`service.ts`), polled every 5s while running. Each
  arm entry carries `run_id`, status, heartbeat, verified cost
  (`compute_run_cost` summary), the run's whole output, and error.
- **Compute only via the server**: `POST /workflows/comparisons` (streams a
  typed `workflow_comparison_started` event carrying the row id before any
  spend) and `POST …/arms/{i}/rerun`. Arm cancel is the CANONICAL
  `POST /runs/{run_id}/cancel` on the arm's own run. ⚠️ Both comparison
  paths ride a DELETE-ME cast in `service.ts` until the next routine
  `pnpm sync-types` after the server deploy.
- **Locked vs varied is computed, explicit, and data**: each arm's SERVED
  input surface (`GET /workflows/{id}/run-form`, the same contract the real
  run form uses) is fetched; fields EVERY arm declares render once as the
  locked shared inputs, fields only some arms declare render under that arm
  as its visible override. Human-typed values are claimed `source=human`
  (satisfies `ask`-sourced inputs); the server re-runs the same canonical
  input funnel per arm.
- **Live progress** renders through `WorkflowRunBoard(runId)` — the
  canonical zero-config run view; no bespoke stream rendering anywhere.
- **Blind judging** reuses Agent Battle's pure helpers
  (`features/agent-comparison/shared/blind.ts`): shuffle the columns, hide
  labels/versions/costs, reveal on verdict. Verdict (`verdict_winner/
  notes/at/by`) writes directly to the row.
- **The half-price-cake rule** (Arman, 2026-08-26): a shorter/smaller output
  is NOT savings. Per-arm cost is verified server-side; `metrics.
  normalization` on the row is reserved for per-unit normalization display.

## Files

- `types.ts` — `ComparisonRow` (generated DB type), `ComparisonArm` parser
  (`parseArms`), `ArmDraft`.
- `service.ts` — direct reads/verdicts, workflow + version pickers (direct
  `workflow.definition` / `definition_version` reads, RLS-scoped), start /
  rerun / cancel.
- `components/WorkflowBattlePage.tsx` — setup (arm cards + locked master
  input + per-arm overrides), live columns, blind judging, verdict, history
  panel.
- `components/ArmSetupCard.tsx` — the workflow picker + version pinning (no
  platform-wide workflow picker existed before this).

## Change Log

- 2026-08-26 — Feature created: full battle lifecycle (setup → locked
  inputs → run → blind judge → verdict → history). Replaces the deleted
  podcast-race demo surface.
