# Post-Migration Plan & Runbook — CTX Association Overhaul

> What happens around and after the Phase-1 SQL. Requirement: prove the new path works before anything is dropped.

## Step 0 — Pre-flight (before running Phase 1)
- Take a fresh DB snapshot/restore point (outage window today makes this cheap).
- Confirm `ctx_projects` exposes `organization_id` and `ctx_project_members(project_id,user_id)` exists (the access helper assumes both — they appear in the existing `ctx_tasks` policies).
- Confirm every CONFIRMED-litter table (ledger B/C) has an `id uuid` PK (the backfill loop joins on `id`). If any lacks one, remove it from the loop and handle separately.

## Step 1 — Run Phase 1 (one transaction)
`ctx-association-migration-phase1.sql`. It commits or rolls back atomically. Watch the `RAISE NOTICE` row counts and the backfill assertion.

## Step 2 — Immediate verification (read-only)
```sql
-- a) Every deprecated row made it across (ids preserved)
SELECT (SELECT count(*) FROM ctx_scope_assignments_deprecated) AS dep_scope,
       (SELECT count(*) FROM ctx_associations WHERE target_type='scope') AS new_scope,
       (SELECT count(*) FROM ctx_task_associations_deprecated) AS dep_task,
       (SELECT count(*) FROM ctx_associations WHERE target_type='task')  AS new_task;
-- b) Compat views return identical shape/data to the deprecated tables
SELECT * FROM ctx_scope_assignments ORDER BY id LIMIT 5;
SELECT * FROM ctx_task_associations ORDER BY id LIMIT 5;
-- c) Write path through the view works (and lands in ctx_associations), then clean up
-- d) RLS smoke test: run as a normal user (anon/auth context), confirm only
--    org-visible associations are returned.
```
Exercise the existing reader RPCs against the views: `get_entity_scopes`, `list_entities_by_scopes`, `resolve_full_context`, `get_user_full_context`, `get_tasks_for_entity`, `get_task_associations`. Confirm unchanged output.

## Step 3 — Run the Supabase-internals audit (the silent killers)
Hand `ctx-supabase-internals-audit-brief.md` to 10 sub-agents (alphabetical table slices). Collate findings into the ledger. Anything that references the deprecated tables/columns becomes a fix item before Phase 2.

## Step 4 — Codebase cutover (IDE agent; see migration-analysis brief)
- Repoint the **writer** RPCs to write `ctx_associations` directly (canonical, not via the compat view): `set_entity_scopes`, `associate_with_task`, `dissociate_from_task`, `create_task_with_association`, `create_tasks_bulk`. (`set_context_value` / `set_scope_context_value` are value-layer, unaffected unless they touched assignments.)
- Repoint app/ORM/types: stop reading & writing the litter `project_id`/`task_id` columns; use `ctx_associations`.
- Normalize `source_type` tokens to the canonical vocabulary (ledger G).
- Regenerate Supabase types / ORM models.

## Step 5 — Soak
Run Phase-1 state in production for the agreed period. Watch logs for errors referencing the deprecated tables/columns. Flip each ledger row `frozen → verified` as the audit + cutover clear it.

## Step 6 — Phase 2 (destructive), in batches
Run `ctx-association-migration-phase2-drops.sql` in batches (2A, then 2B), re-verifying between. Run 2C (retire compat views + deprecated tables) **last**, only after all writer RPCs are canonical and nothing references the old names. Resolve the §E judgment columns before including them anywhere.

## One-shot guidance (the question you asked)
- **Phase 1 today = yes, safe to one-shot.** It is non-destructive and atomic; the app keeps working identically through the compat layer even though it's a big structural change.
- **Phase 2 today = no, even with an outage window.** The litter columns are still referenced by app code; dropping them before Step 4 ships broken code, not just a broken DB. The DB risk is near-zero; the *app-orphaning* risk is the reason to wait. Drop only after the audit + cutover.

## Rollback
Before app cutover, the Phase-1 header ROLLBACK block fully reverts (rename deprecated tables back, drop the new table/views/function). After cutover, roll forward (fix) rather than back.
