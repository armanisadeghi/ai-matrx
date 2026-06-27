---
name: db-table-retrofit
description: Short-term migration skill for the 2026 DB changeover (Wave 3 base-retrofit). Use whenever retrofitting any public.* table to the Base-1/2/3 standard — adding the standard columns, backfilling org + actor, attaching the shared triggers, applying canonical RLS, and (gated) dropping litter/superseded columns. Triggers on "retrofit <table>", "Wave 3", "base retrofit", "apply_rls / org backfill on <table>", or any task pointed at the CHANGEOVER_PROGRESS tracker. Covers the exact per-table recipe, org-source + collision rules, verification, and the ledger + tracker discipline that make a table actually *done*. NOT for the schema reorg (Wave 4) or final table drops (Wave 5).
---

# DB Table Retrofit — the recipe (Wave 3)

You are retrofitting one (or a small batch of) `public.*` table(s) to the changeover standard. **Read first:** `docs/db_rebuild/CHANGEOVER_PROGRESS.md` (the live tracker — find your table, its class, org-source, collisions) and `docs/db_rebuild/db-core-standards-and-automation.md` (the standard). DB project: **`txzxabzwovsujtloxrus`** (apply via Supabase MCP `apply_migration`).

## The machinery (already live — don't recreate)
- `platform._touch_row()` — BEFORE INS/UPD: sets `updated_at=now()`, `version=OLD.version+1` on UPDATE. Requires the table to have `updated_at` + `version`.
- `platform._stamp_actor()` — BEFORE INS/UPD: `created_by`/`updated_by` from `current_setting('app.user_id')`.
- `platform._version_capture('<token>')` — AFTER INS/UPD/DEL: snapshots into `history.row_versions`. Org-agnostic (reads `org_id` OR `organization_id`).
- `iam.apply_rls(schema, table, token, variant)` — `variant ∈ entity|component|ledger` (**there is NO `join` variant** — see `.claude/skills/db-change/TOOLKIT.md`). DROPS all existing policies, then rebuilds the canonical set; emits `pub_read` from a `visibility` column. Org-gated on `organization_id`.
- `iam.has_org_access(org)` — true for **every** org the user belongs to (so org-first RLS = "see all my orgs", no active-org needed).

## Step 0 — classify (from the tracker)
- **Base-1** entity (org-owned business object) → full retrofit.
- **Base-2** join (`a_id`+`b_id`, no lifecycle) → **no `join` variant exists**; treat as `component` (needs a `composition` edge) or hand-write org-gated policies (`has_org_access(organization_id)`) like `platform.associations`. Carry `organization_id` + `created_by` + `created_at` only.
- **Base-3** log/event/append-only → `apply_rls(...,'ledger')`, **no** `version`/`deleted_at`/history.
- **child** (hangs off a parent that has org) → **denormalize** org from the parent.
- **lookup/system** → may have no org; leave RLS per its real access model.

## Step 1 — ADDITIVE retrofit (safe, reversible, no PITR needed)
1. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` the missing standard columns (`created_by`, `updated_by`, `updated_at`, `version int not null default 1`, `organization_id` if absent). **Don't re-add a column the table already has** (e.g. an existing `version` anchor — reuse it).
2. **Collision rule:** if `created_by` already exists with a non-actor meaning (e.g. an enum), `ALTER ... RENAME COLUMN created_by TO created_by_kind` first, then add the standard `created_by uuid`.
3. **Drop the legacy `<table>_updated_at` (or `*_updated`) trigger BEFORE the backfill** so the backfill doesn't stamp every row's `updated_at=now()` (wrecks recency sort).
4. **Backfill** (guard each on `... IS NULL` so re-runs are no-ops):
   - actor: `created_by = <owner col>` (usually `user_id`).
   - org — pick the source from the tracker: **personal** = `(select id from organizations where is_personal and created_by = <usercol> order by created_at limit 1)`; **parent** = join the parent table and copy its org.
5. Attach `_touch_row` + `_stamp_actor` (`DROP TRIGGER IF EXISTS` then `CREATE`).
6. **Self-verify DO block** (whole migration rolls back on failure): assert 0 null org, 0 null `created_by`, both triggers attached → `RAISE EXCEPTION` otherwise.

## Step 2 — history capture
Attach `_version_capture('<entity_types token>')` **unless** the table is extreme-churn (defer — note it in the tracker).

## Step 3 — RLS flip (GATED — only after Step 1 + 0-null org)
`iam.apply_rls('public','<table>','<token>','entity'|'component'|'ledger')` — it drops ALL existing policies on the table itself and rebuilds the canonical `std_*`/`svc_all`/`pub_read` set, so don't re-add legacy policies afterward (Postgres OR-combines permissive policies → the old ones would over-permit). Verify a normal authenticated user still reads their rows (impersonate via `set_config('request.jwt.claims', json_build_object('sub', <uid>)::text, true)`).

## Step 4 — `org_id NOT NULL` (after a fresh 0-null verify)

## Step 5 — litter/superseded DROPS (GATED — consumer repoint + PITR + move-to-graveyard)
Only after the column's FE/admin consumers are repointed (see the tracker's repoint table) **and** PITR is confirmed. Drop `_mirror_proj`/`_mirror_task` triggers first; confirm data is in `platform.associations`; then drop the column. Whole dead tables → `ALTER TABLE ... SET SCHEMA graveyard` (never `DROP TABLE`).

## Worked template (the cx_conversation pattern)
See `migrations/cx_conversation_base_retrofit.sql` and `cx_message_base_retrofit.sql` (child/denormalized org) — copy their shape.

## Verify + record — NON-NEGOTIABLE (a file ≠ done)
1. Apply via Supabase MCP `apply_migration` (name `<table>_base_retrofit`).
2. Write `migrations/<table>_base_retrofit.sql` (the exact SQL).
3. `shasum -a 256` it → insert `public._schema_migrations` (`source='matrx-frontend'`, `filename`, `checksum`, `duration_ms=0`) so `pnpm check:migrations` stays green.
4. **Update the table's row in `docs/db_rebuild/CHANGEOVER_PROGRESS.md`** + the dashboard counts + change log.
5. `git add` the migration + tracker, commit (conventional message), `git push origin main`.

## NEVER
- Apply org-first RLS before org is backfilled (NULL org → `has_org_access` false → rows vanish).
- Drop a column before consumers are repointed + PITR confirmed.
- `DROP TABLE` (use `SET SCHEMA graveyard`).
- Leave a migration unledgered.
- Touch **out-of-scope litter**: `sch_*` (scheduler), `wf_*`/`workflow`, `code_*`, `wc_*` — their `project_id`/`task_id` are NOT association litter; leave them.
