# Canonical-RLS Lane — scope fence (so other agents/devs stay clear)

> **One agent owns this lane.** It carries feature groups to *canonical RLS done* —
> DB **and** matching code in the same pass — which is the step the paused Wave-3
> sweep was missing. Plugs into the existing machinery ([`CHANGEOVER_PROGRESS.md`](./CHANGEOVER_PROGRESS.md),
> `platform.retrofit_entity`, the `db-table-retrofit` skill, the `_schema_migrations`
> ledger). It does **not** fork a parallel process.

## What this lane OWNS (stay clear of these)

**A. Shared platform primitives (DONE — do not hand-edit):**
- `iam.apply_rls` v2 — the single RLS generator. Mechanism: [`db-canonical-rls.md`](./db-canonical-rls.md). ✅
- `platform._stamp_actor` — now falls back to `auth.uid()` over PostgREST. ✅
- `iam.has_access` — the single resolver (pre-existing; this lane extends it if a new access pathway is needed).
- **Assignment = a `public.permissions` grant** (the canonical answer to `ctx_tasks.assignee_id`): assigning a row to a user writes an editor grant, which `has_access` already honors. No per-table policy branch, no resolver bloat — generalizes to anything assignable. Implemented when the lane reaches the tasks group.

**B. Per claimed feature group — the full pass (DB + code together):**
1. **DB:** base-retrofit any missing standard columns via `platform.retrofit_entity` (keep `organization_id` naming) → migrate `is_public`→`visibility` where present → confirm/register `platform.entity_types` (+ composition edge for components) → `SELECT iam.apply_rls(...)` → **verify live** as a real authenticated user (`INSERT…RETURNING` succeeds for owner; a different user sees 0).
2. **Code:** sub-agents update the FE (and Python, where this lane's tables are read) to the new shape — column renames, `is_public`→`visibility` reads, litter `project_id`/`task_id` → `platform.associations` reads, and any code assuming the old policies.
3. **Track:** update `CHANGEOVER_PROGRESS.md` (mark the group `OWNED: canonical-RLS lane`) + record each migration in `_schema_migrations`.

## What this lane does NOT touch
- **PITR-gated actions** — no `DROP COLUMN`/`DROP TABLE`/`SET NOT NULL` until Arman confirms PITR. Litter columns are *read-migrated* in code but **dropped later** in the gated pass.
- **Unclaimed groups** — only groups explicitly marked `OWNED: canonical-RLS lane` in the tracker. Everything else stays with the Wave-3 lead / other agents.
- **Out-of-scope litter groups** — `sch_*`, `wf_*`/workflow, `code_*`, `wc_*` (their `project_id`/`task_id` are real FKs, per CHANGEOVER §8).
- **Dying tables** — `ai_runs`, `ai_model*`, `ai_provider`, `ai_endpoint*`, `ai_model_pricing`.
- **`platform.retrofit_entity`** (the lead's routine) — used, not modified. If it needs a fix, flagged to Arman, not forked.

## Order of claims (each claimed only after Arman fences it)
1. **`notes`** (proof slice — small, 5/6 already retrofitted, clear FE in `features/notes`, needs `is_public`→`visibility` + apply_rls + a small code cutover). ← proposed first
2. then a central group — `agx`/`aga` (agents) **or** `scope` — Arman's call.
3. expand group-by-group.

> New exceptions found mid-sweep (a table that needs a new access pathway, a shape the generator doesn't cover) are improvements to the canonical system: fix the primitive in **A**, document it here + in `db-canonical-rls.md`, then continue — never a one-off.

## Status
- 2026-06-26: Lane opened. Primitives A done + verified live. War Room (`wr_sessions`, `wr_threads`) on v2. Awaiting Arman's fence on the first feature group.
