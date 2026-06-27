---
name: db-graveyard-table
description: Retire a live table during the 2026 Matrx DB transition by moving it to the graveyard schema (reversible, zero data loss) and clearing every reference across both repos. Use whenever the task is "graveyard <table>", "retire <table>", "this table is dead / no longer used", or taking a table offline without dropping it. Covers the reference-discovery queries (inbound FKs, RPCs, views, app code in matrx-frontend + aidream), the SET SCHEMA graveyard move, registry de-registration, and the cross-repo cleanup. Read db-change/SKILL.md + db-change/TOOLKIT.md first. NOT for relocating a still-used table (use db-move-table-schema) or a hard DROP (gated, later).
---

# Graveyard a table

Goal: get the table **offline and reversible** (`SET SCHEMA graveyard`, never `DROP`), then erase every reference. **Getting it offline is priority #1; reference cleanup follows and must not block the move.** Read [`../db-change/TOOLKIT.md`](../db-change/TOOLKIT.md) + [`../db-change/SKILL.md`](../db-change/SKILL.md) first. Project: `txzxabzwovsujtloxrus`.

## Step 1 — Discover every reference (this is the real work)
Run all of these (`execute_sql`) and grep both repos. Record the hit list.
```sql
-- inbound FKs (tables that point AT this one)
select conrelid::regclass as referencing_table, conname, pg_get_constraintdef(oid) as def
from pg_constraint where confrelid = 'public.<table>'::regclass and contype='f';

-- functions / RPCs that mention it (broad; expect false positives, read each)
select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where pg_get_functiondef(p.oid) ilike '%<table>%';

-- views that mention it
select schemaname, viewname from pg_views where definition ilike '%<table>%';

-- is it registered as a platform entity / shareable / in associations?
select * from platform.entity_types where table_name='<table>';
select * from public.shareable_resource_registry where table_name='<table>';

-- is anything still actually reading it? (needs pg_stat_statements)
select calls, query from pg_stat_statements where query ~* '\m<table>\M' order by calls desc limit 20;
```
Code (both repos): grep `<table>` for `.from('<table>')`, `.schema(...).from('<table>')`, generated type names, Python model/manager names (`aidream/db/models*.py`, `db/managers/**`), package wiring in `aidream/package_integration.py`.

## Step 2 — Confirm it's truly dead
If reads remain: repoint or delete those consumers if quick; otherwise graveyard now (reversible) and **track the remaining cleanup** in `docs/db_rebuild/CHANGEOVER_PROGRESS.md`. Do not block the move on a long repoint — but never graveyard a table with live, load-bearing reads you haven't accounted for.

## Step 3 — Resolve inbound FKs
A cross-schema FK keeps working after the move, so the move won't *break* — but a dead table shouldn't be referenced. Drop or repoint inbound FK constraints that shouldn't exist. If an inbound FK represents real data you can't yet sever, that table isn't dead — reconsider.

## Step 4 — Move it (idempotent, verify no data lost)
```sql
do $$ begin
  if to_regclass('public.<table>') is not null then
    execute 'alter table public.<table> set schema graveyard';
  end if;
end $$;
select count(*) from graveyard.<table>;   -- equals the pre-move count
```

## Step 5 — De-register
Remove the platform footprint so nothing resolves to it:
```sql
delete from platform.entity_relationships where child_type='<token>' or parent_type='<token>';
update platform.entity_types set is_active=false where token='<token>';   -- or delete the row
delete from public.shareable_resource_registry where table_name='<table>';
```
Leave satellite rows (`associations`/`comments`/…) keyed by the token in place unless they're now orphaned — sweep separately; they're harmless and reversible.

## Step 6 — Cross-repo cleanup + finalize
`graveyard` IS in the `db-types` schema list, so the table still appears under the `graveyard` schema in FE types — that's fine; the point is to **delete every code usage**. Then run the finalize SOP (db-change/SKILL.md): `pnpm db-types` → remove FE usages → `pnpm sync-types` (fix TS); `python db/generate.py` → remove aidream usages + `package_integration.py` entry → `python db/detect_applied.py` → `python run.py` clean boot. Record the migration in the ledger. Commit + push `main` on both repos.

## NEVER
- `DROP TABLE` — `SET SCHEMA graveyard` only (DROP is a separate PITR-gated step).
- Graveyard a table that still has live reads you haven't repointed or tracked.
- Leave a generated type / Python model / `package_integration.py` reference pointing at the moved table.
