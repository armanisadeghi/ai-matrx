# Canonical Sweep — per-table runbook (for parallel agents)

> One table = one unit of work. Claim it, run this recipe, verify, record. The shared
> primitives (`iam.apply_rls`, `iam.has_access`, `has_permission`, `_stamp_actor`, the
> registries, the guard triggers) are **frozen** — consume them, never edit them. If you
> think one needs changing, escalate; don't fork it in your lane.
>
> Authority: the canonical checklist (in `CANONICAL_RLS_LANE.md`), the mechanism
> ([`db-canonical-rls.md`](./db-canonical-rls.md)), sharing ([`canonical-sharing-unification.md`](./canonical-sharing-unification.md)).

## The board / claim ledger — `iam.canonical_sweep`
- See the work-list: `select * from iam.canonical_sweep where not coalesce(verified_ok,false) order by schema_name,table_name;` (each row's `fails` = exact failing checks).
- Claim atomically: `select iam.sweep_claim('<schema>','<table>','<your-agent-id>');` → `true` if you won it, no row if already taken.
- After remediating: `select iam.sweep_record('<schema>','<table>');` → re-verifies and flips it to `done` if clean.
- Drift / full re-check: `select iam.sweep_refresh();`

## The recipe (per claimed table)

1. **Classify the variant** (the row's `variant`, or decide):
   - `entity` — a thing a user owns (has/should-have `created_by`). Roots and standalone records.
   - `component` — a structural part of a parent; access = parent's. Needs a `composition` edge in `platform.entity_relationships` (`child_type, parent_type, fk_column`).
   - `ledger` — append-only telemetry/log; org-scoped read, service writes only.

2. **Base-retrofit (additive)** — only the missing standard columns:
   `created_by uuid`, `updated_by uuid`, `organization_id uuid`, `visibility platform.visibility NOT NULL DEFAULT '<entity default>'`, `deleted_at timestamptz`, `version int NOT NULL DEFAULT 1`, `metadata jsonb NOT NULL DEFAULT '{}'`, `created_at`/`updated_at`.
   Backfill: `created_by := COALESCE(created_by, user_id)`; `visibility := 'public' where is_public`. Attach the shared triggers `_stamp_actor` + `_touch_row`.
   (`platform.retrofit_entity` automates this **for `public.` tables only** — non-public schemas like `workflow.*` are hand-rolled; see the worked example.)

3. **Register** in `platform.entity_types` (`token, schema_name, table_name, label, default_visibility, is_component`). Component? add the `composition` edge to `platform.entity_relationships`. Shareable? the registry guard requires `shareable_resource_registry.resource_type = token`.

4. **Generate RLS**: `select iam.apply_rls('<schema>','<table>','<token>','<variant>');` — never hand-write policies.

5. **Verify**: `select iam.sweep_record('<schema>','<table>');` must return `true`. Inspect detail with `select * from iam.verify_canonical(...)`. `WARN`s (legacy `user_id`/`is_public`/`is_deleted` still present) are fine — they're tracked transition leftovers, dropped later under PITR.

6. **Code cutover** (own worktree): switch FE/Python reads off renamed/removed shapes; nothing is removed in this pass, so most tables need no code change. Commit only your table's files.

## Backend-owned tables — REQUIRED pre-check (before canonicalizing)
A table the Python backend writes (e.g. `workflow.*`, `runtime.*`, most `cx_*`) needs this BEFORE `apply_rls`:
- **Does the engine write `created_by`?** aidream does **not** set the Postgres `app.user_id` GUC, so `_stamp_actor` can't fill `created_by` on service-role inserts. If the engine still writes a legacy owner (`user_id`) and not `created_by`, then under canonical RLS every new engine-created row is **owner-less → invisible to its owner**. Fix one of: (a) repoint the engine to write `created_by`, (b) add a transition bridge trigger `created_by := COALESCE(created_by, user_id)` (see `workflow_legacy_owner_bridge.sql`), or (c) make aidream set `app.user_id`.
- **Does the engine read a legacy owner for authz?** (e.g. `assert_*_owner` comparing `user_id`). Those gates must move to `created_by` *and be deployed* before the legacy column can be dropped.
- **Do the engine's table references match the live schema?** A rename (`wf_*`→`workflow.*`) can leave raw SQL pointing at dead names. Confirm the live write path works before assuming canonicalization is the only change.

## Gotchas (each one is a bug we already hit)
- **Owner short-circuit is mandatory.** `std_select`/`std_update` lead with `created_by = (select auth.uid())`; a `has_access`-only policy 42501s on `INSERT…RETURNING`. (`apply_rls` does this for you — don't hand-write.)
- **`_stamp_actor` over PostgREST** auto-stamps `created_by` from the JWT (fixed) — but the client may still pass it; either is fine.
- **Sharing token = entity token.** `has_permission` is token-agnostic now, but keep `shareable_resource_registry.resource_type = entity_types.token` (the guard enforces it).
- **`is_public` is not the access driver** — `visibility` is. "Make public" sets `visibility='public'`.
- **Backend-owned tables** (e.g. `workflow.*`, `runtime.*`): `apply_rls` keeps `svc_all` (service role full access), so the Python engine is unaffected. Verify owner reads still work; coordinate before touching if unsure.
- **PITR gate**: never `DROP`/`SET NOT NULL` legacy columns in this pass.

## Worked example — `workflow.definition` (non-public, backend-owned root)
`migrations/workflow_definition_canonical.sql`: added `created_by/updated_by/visibility/deleted_at/version/metadata`; backfilled `created_by:=user_id`, `visibility:='public' where is_public`; attached `_stamp_actor`+`_touch_row`; registered `entity_types('workflow','workflow','definition',…)`; `apply_rls('workflow','definition','workflow','entity')`; `sweep_record` → `true`. Non-breaking (service role unaffected; owner access preserved).

## Parallel fan-out
Point N agents (or a Workflow pipeline) at the board. Each: **`sweep_claim` → recipe (in its own worktree) → `sweep_record`**. A final `sweep_refresh()` is the global gate. Throughput = concurrency cap; nothing lands un-verified.
