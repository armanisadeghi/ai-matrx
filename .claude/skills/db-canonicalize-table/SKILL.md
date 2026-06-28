---
name: db-canonicalize-table
description: Bring a table (and its feature) into full conformance with the Matrx platform standard during the 2026 DB transition — base columns, canonical RLS, entity_types registration, sharing registry, the polymorphic satellites (associations/comments/categories/activity/favorites), and versioning — preserving existing behavior exactly. Use whenever the task is "canonicalize <table/feature>", "bring <X> onto the platform base entity / standard", "make <X> use the platform comments/associations/permissions instead of its own", or "fully conform <table> to platform". Encodes the exact ordered pipeline (columns → register → edges → sharing → apply_rls → versioning → satellites → verify), the real function calls, and the gotchas. Read db-change/SKILL.md + db-change/TOOLKIT.md first. NOT for a partial Wave-3 base-retrofit only (use db-table-retrofit) or a schema move/retire.
---

# Canonicalize a table

Make `<schema>.<table>` (token `<token>`) fully conform to the platform standard, **behavior preserved exactly**. Read [`../db-change/TOOLKIT.md`](../db-change/TOOLKIT.md) (live signatures, gotchas) + [`../db-change/SKILL.md`](../db-change/SKILL.md) first. Project: `txzxabzwovsujtloxrus`. Order matters — do the steps in sequence.

## Step 0 — Classify the variant
- **entity** — independent business object (its own owner/visibility). Most tables.
- **component** — child whose access IS its parent's, full depth (versions, events, line-items). RLS defers to a `composition` parent; no own visibility.
- **ledger** — append-only org-scoped log. No user writes, no version/soft-delete.
Check existing columns/policies/triggers first: `\d`-style via `information_schema.columns`, `pg_policy`, `pg_trigger` (see TOOLKIT.md §5–6).

## Step 1 — Base columns (additive, idempotent)
**`public.*` table → use the driver** (adds org/created_by/updated_by/updated_at/version, backfills, attaches `_touch_row`+`_stamp_actor`):
```sql
select platform.retrofit_entity('<table>','<token>',
  '<personal|parent|keep>', '<owner_col>',           -- e.g. 'personal','user_id'
  '<parent_table_or_null>','<parent_fk_or_null>',     -- for 'parent' strategy
  '<legacy_updated_at_trigger_or_null>');             -- dropped so backfill doesn't bump updated_at
```
**Ordering (verified):** `retrofit_entity` backfills created_by + org *before* attaching the triggers, so its backfills don't churn `version`/`updated_at`. The `visibility`/`deleted_at` columns it does NOT add — so add `visibility` and run the `is_public→visibility` / `is_deleted→deleted_at` normalization **before** calling `retrofit_entity` (triggers not yet attached). Doing them after leaves freshly-migrated rows at `version=2` with `updated_at=now()` (looks edited when it was only migrated).
**Schema-homed table (NOT public) → retrofit_entity does NOT work; hand-roll:**
```sql
alter table <schema>.<table> add column if not exists organization_id uuid;
alter table <schema>.<table> add column if not exists created_by uuid;       -- if a non-uuid created_by exists, rename it to created_by_kind first
alter table <schema>.<table> add column if not exists updated_by uuid;
alter table <schema>.<table> add column if not exists updated_at timestamptz not null default now();
alter table <schema>.<table> add column if not exists version int not null default 1;
alter table <schema>.<table> add column if not exists deleted_at timestamptz;
alter table <schema>.<table> add column if not exists metadata jsonb not null default '{}';
alter table <schema>.<table> add column if not exists visibility platform.visibility not null default 'private';  -- entity/shareable only
-- normalize legacy → canonical (guard each on IS NULL so re-runs are no-ops)
update <schema>.<table> set created_by = coalesce(created_by, <owner_col>) where created_by is null;
update <schema>.<table> set visibility = 'public' where <is_public_col> is true and visibility <> 'public';
update <schema>.<table> set deleted_at = <deleted_ts_or_now> where <is_deleted_col> is true and deleted_at is null;
-- backfill org: personal → owner's personal org else system org (39c38960-…); or copy from parent
update <schema>.<table> t set organization_id = coalesce(
   (select o.id from public.organizations o where o.is_personal and o.created_by=t.created_by order by o.created_at limit 1),
   '39c38960-d30c-4840-b0c1-c9960de95582') where organization_id is null;          -- (or join the parent)
-- drop legacy updated_at trigger, attach the shared triggers
drop trigger if exists <legacy_updated_at_trigger> on <schema>.<table>;
drop trigger if exists _touch_row on <schema>.<table>;
drop trigger if exists _stamp_actor on <schema>.<table>;
create trigger _touch_row  before insert or update on <schema>.<table> for each row execute function platform._touch_row();
create trigger _stamp_actor before insert or update on <schema>.<table> for each row execute function platform._stamp_actor();
```
Verify **0 null org** and **0 null created_by** (where an owner existed) before continuing. Backend-written tables: ensure the engine writes `created_by` (service role doesn't stamp it — TOOLKIT.md §5).

## Step 2 — Register the entity (idempotent)
```sql
insert into platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_versioned, is_active)
select '<token>','<schema>','<table>','<Label>','private', <is_component:false|true>, <is_versioned:true|false>, true
where not exists (select 1 from platform.entity_types where token='<token>');
```
If **component**, add the composition edge (required before `apply_rls`):
```sql
insert into platform.entity_relationships (child_type, parent_type, fk_column, kind)
select '<token>','<parent_token>','<fk_col>','composition'
where not exists (select 1 from platform.entity_relationships where child_type='<token>' and kind='composition');
```
(Optional `kind='containment'` edges add read-cascade for `visibility>=internal` — additive.)

## Step 3 — Sharing registry (entity is user-shareable)
```sql
insert into public.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column, is_public_column, display_label, url_path_template, rls_uses_has_permission)
values ('<token>','<schema>','<table>','id','created_by','visibility','<Label>','/<path>/{id}',true);
```
`resource_type` MUST equal `<token>` (mismatch → grants silently ignored).

## Step 4 — Canonical RLS (the only policy authority)
Inventory existing policies first (`apply_rls` **drops them all**); fold anything load-bearing into the standard model. Then:
```sql
select iam.apply_rls('<schema>','<table>','<token>','<entity|component|ledger>');
```
(`entity` requires created_by + organization_id present; `component` requires the composition edge. There is **no `join` variant** — TOOLKIT.md §2.)

## Step 5 — Versioning
- **Table already versions** (history/audit today) → put it on the central system: attach the capture trigger.
- **Table does NOT version today** → **ASK the PM (the user) whether to add versioning** at canonicalization. Do not silently add or skip.
```sql
-- when versioned: set is_versioned=true in entity_types AND attach the trigger (registration alone captures nothing)
create trigger _history after insert or update or delete on <schema>.<table>
for each row execute function platform._version_capture('<token>');
```
Confirm the current month's `history.row_versions` partition exists (capture starts only when `_history` is attached — pre-existing rows are NOT auto-backfilled). **Backfilling old versions** (retiring a per-feature `*_versions` table): `history.row_versions` is **monthly RANGE-partitioned**, so first pre-create a partition for EVERY month in the source's date range (`min(created_at)..max`) or the INSERT fails with a no-partition error (verified — `note_versions` spanned 7 months, only 2 partitions existed). Map `row_id`/`version`/`occurred_at`/`actor_id`; stash extra fields under reserved `_*` keys in `row_data`; verify `count(history)=count(source)`. (Optional `_gc` → `platform._gc_entity_associations('<token>')` cleans association edges on delete.)

## Step 6 — Replace the feature's bespoke subsystems with the platform satellites
If the feature has its OWN comments / associations-relationships / categories / activity-log / favorites-pins, **migrate the rows into the platform tables keyed by `(entity_type='<token>', entity_id)`** and graveyard the old tables (use `db-graveyard-table`). Behavior must be identical afterward — verify the UI shows the same comments/tags/relationships. (`platform.comments`, `platform.associations`, `platform.categories`, `platform.activity_log`, `platform.user_entity_state` — shapes in TOOLKIT.md §1.) Permissions/shares → migrate into `public.permissions` (TOOLKIT.md §3).

## Step 6.5 — Drop the legacy columns (reach zero-WARN)
In downtime, once consumers are repointed, drop `user_id`/`owner_id`, `is_public`, `is_deleted`, `shared_with` to clear the legacy WARNs. **Each drop has couplings — check first (all bit us on `notes`):**
- **Backfill with triggers OFF:** wrap the `is_deleted→deleted_at` / `is_public→visibility` UPDATE in `alter table … disable trigger user; … ; enable trigger user;`, else `_touch_row` churns `version`/`updated_at` and the version/sync/ingest triggers fire on every touched row.
- **Functions/triggers that read the column (the silent killers):** scan ALL functions (`prokind in ('f','p')` to skip aggregates) for BOTH `(from|join|update)\s+<table>` AND `new\.<col>`/`old\.<col>` — a `FROM/JOIN` scan MISSES trigger functions that read `NEW.<col>` (notify/ingest/sync/version triggers), and **SECURITY DEFINER functions aren't caught by `tsc`**. Verified casualties of skipping this: `_notify_auto_ingest_note` (`NEW.is_deleted` → every note write failed silently) and `get_user_dashboard_metrics` (`is_deleted` → dashboard broke). Patch each to the canonical column **before** dropping.
- **RLS on OTHER tables:** a child policy may reference this column via subquery (`… WHERE notes.user_id = auth.uid()`). `DROP COLUMN` fails `2BP01` and lists them — repoint each to `created_by`; **never blind-`CASCADE`** (it silently drops the policy).
- **Indexes:** `DROP COLUMN` auto-drops indexes that include it. Recreate the useful composites on `created_by` (owner/sync/folder lookups) first.
- **Prove safe first:** `count(*) filter (where created_by is distinct from <owner_col>)=0`, `is_public`/`shared_with` empty — then the drop loses nothing.

## Step 7 — Verify (the acceptance gate)
```sql
select * from iam.verify_canonical('<schema>','<table>','<token>');   -- read EVERY row
select iam.verify_canonical_ok('<schema>','<table>','<token>');        -- floor: no FAIL
```
**Bar (verified live):** `col_visibility`, `soft_delete`, `timestamps` must reach PASS (add the columns — never leave them WARN). The three legacy WARNs — **`legacy_owner_col`** (`user_id`/`owner_id`), **`legacy_is_public`**, **`legacy_is_deleted`** (added to `verify_canonical` 2026-06-27) — clear only when those columns are dropped (Step 6.5). **Full canonical = zero FAIL + zero WARN**, achievable in one pass when you do the drops (proven on `notes`+`note_folders`); if the drops must wait, the transition-state floor is zero FAIL + only those legacy WARNs. Don't report "canonical" with a `col_visibility`/`soft_delete` WARN showing. Then impersonate a normal user and confirm they still read their own rows (RLS didn't hide data):
```sql
select set_config('request.jwt.claims', json_build_object('sub','<a real user uuid>')::text, true);
select count(*) from <schema>.<table>;   -- expect their visible rows, not 0
```

## Step 8 — Cross-repo finalize + document
db-change SOP: `pnpm db-types` → update all usages (new columns, `.schema()` if needed, RPC names) → `pnpm sync-types` (fix TS); `python db/generate.py` → update usages + `package_integration.py` → `python db/detect_applied.py` → `python run.py` clean boot. Ledger the migration. Update the feature's `FEATURE.md` + `docs/db_rebuild/CHANGEOVER_PROGRESS.md`. Commit + push `main` on both repos.

## NEVER
- `apply_rls` before org is backfilled (0 nulls) or before `entity_types` (+ composition edge for components) exists.
- Trust `verify_canonical_ok` alone — WARNs are unfinished canonicalization.
- Assume `is_versioned=true` captures history — it doesn't without the `_history` trigger.
- Leave the feature reading its old comments/associations table after migrating the rows — repoint the code, then graveyard the table.
- Change behavior. Canonicalization preserves what the user sees; if anything differs, it's a bug.
