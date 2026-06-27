---
name: db-move-table-schema
description: Relocate a live table to a different Postgres schema during the 2026 Matrx DB transition with every reference intact and zero data loss. Use whenever the task is "move <table> to <schema>", "rehome <table> into the <x> schema", or pulling a table out of public into a domain schema. Covers what SET SCHEMA carries automatically vs. what you must repoint by hand (registry schema_name, hardcoded public.<t> in functions/views, PostgREST exposure + db-types schema list, aidream matrx_orm.yaml + supabase-js .schema() calls). Read db-change/SKILL.md + db-change/TOOLKIT.md first. NOT for retiring a table (use db-graveyard-table) or canonicalizing it (use db-canonicalize-table).
---

# Move a table to a new schema

Relocate `public.<table>` → `<new>.<table>` with references intact. Postgres moves most things for you; the misses are predictable. Read [`../db-change/TOOLKIT.md`](../db-change/TOOLKIT.md) + [`../db-change/SKILL.md`](../db-change/SKILL.md) first. Project: `txzxabzwovsujtloxrus`.

## What `ALTER TABLE … SET SCHEMA` carries automatically
The table's columns, PK, indexes, CHECK/UNIQUE/FK constraints (its own **and** inbound FK constraints — cross-schema FKs keep working), **RLS policies, triggers, and owned sequences** all follow. You do **not** re-create these.

## What you MUST update by hand
1. **Registry rows** — `platform.entity_types.schema_name` and `public.shareable_resource_registry.schema_name` for this token.
2. **Hardcoded `public.<table>` references** in functions/RPCs and views (unqualified refs follow `search_path`; schema-qualified ones break). Find them, `CREATE OR REPLACE` repointed.
3. **PostgREST exposure + FE types** — if the FE reads this table directly, the **target schema must be exposed to PostgREST and added to the `pnpm db-types` `--schema` list** (TOOLKIT.md §0 trap), else the FE loses types and 404s. supabase-js calls change from `.from('<table>')` to `.schema('<new>').from('<table>')`.
4. **aidream ORM** — the target schema must be in `db/matrx_orm.yaml` `additional_schemas` with a generate block; the model regenerates into that schema's `models_<schema>.py`. If a sub-package consumes the table, update `aidream/package_integration.py`.

## Step 1 — Pre-flight discovery
```sql
-- functions & views referencing the qualified name
select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where pg_get_functiondef(p.oid) ilike '%public.<table>%' or pg_get_functiondef(p.oid) ilike '%<table>%';
select schemaname, viewname from pg_views where definition ilike '%<table>%';
-- inbound FKs (will keep working, but note them)
select conrelid::regclass as referencing, conname from pg_constraint where confrelid='public.<table>'::regclass and contype='f';
-- current policies/triggers (confirm they follow after the move)
select polname from pg_policy where polrelid='public.<table>'::regclass;
select tgname from pg_trigger where tgrelid='public.<table>'::regclass and not tgisinternal;
```
Grep both repos for `<table>` usages (FE `.from`, Python models/managers, package wiring).

## Step 2 — Ensure the target schema is ready
`create schema if not exists <new>;` · expose it to PostgREST if FE-read · add it to the `db-types` `--schema` list · add to aidream `matrx_orm.yaml`.

## Step 3 — Move + verify it followed
```sql
alter table public.<table> set schema <new>;
select count(*) from <new>.<table>;                                    -- unchanged
select polname from pg_policy where polrelid='<new>.<table>'::regclass; -- policies followed
select tgname  from pg_trigger where tgrelid='<new>.<table>'::regclass and not tgisinternal; -- triggers followed
```

## Step 4 — Repoint the misses
Update the registry `schema_name` rows; `CREATE OR REPLACE` any function/view that named `public.<table>`; re-verify those RPCs run.

## Step 5 — Cross-repo finalize
db-change SOP: `pnpm db-types` (schema added) → swap `.from('<table>')` → `.schema('<new>').from('<table>')` everywhere → `pnpm sync-types` (fix TS). aidream: `python db/generate.py` → update imports to the new model module + `package_integration.py` → `python db/detect_applied.py` → `python run.py` clean boot. Ledger the migration. Commit + push `main` on both repos.

## NEVER
- Move a FE-read table into a schema that isn't exposed + in the `db-types` list (silent 404s).
- Forget the registry `schema_name` rows — `verify_canonical`/`has_access` resolve schema from `entity_types`, so a stale `schema_name` breaks RLS resolution.
- Recreate policies/triggers/constraints by hand — they moved with the table; recreating them risks drift.
