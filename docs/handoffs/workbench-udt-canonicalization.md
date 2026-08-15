---
type: Handoff
title: Retire the legacy is_public / user_id columns on the four workbench UDT entities
description: The DB canonicalization, RLS, registry and sharing UI are DONE and live. What remains is converting the ~30 RPCs, aidream's picklists router, and ~15 frontend files off is_public/user_id, then dropping those columns and the bridge trigger.
status: In progress — DB + registry + UI shipped 2026-08-15; consumer conversion remains
tags: [sharing, visibility, workbench, canonicalization, rls]
timestamp: 2026-08-15
---

# workbench UDT canonicalization — the remaining half

## What is already DONE and live (do not redo)

`workbook` / `udt_document` / `dataset` / `structured_list` are on the canonical base entity
contract as of 2026-08-15. Applied and ledgered as `matrx-frontend` migrations:

| Migration | What it did |
|---|---|
| `workbench_udt_canonical_step1_base_retrofit.sql` | added `visibility` + backfill, `created_by` NOT NULL, indexes, and the bridge trigger |
| `workbench_udt_canonical_step2_apply_rls.sql` | `iam.apply_rls(...,'entity')` on all four; anon narrowed to SELECT |
| `workbench_udt_canonical_step3_registry.sql` | registry rows → `owner_column='created_by'`, `is_public_column=NULL` |

Also shipped: the TS registry mirror + snapshot, `pnpm db-types`, aidream `db/generate.py`, and a
three-state visibility picker in `PublicAccessTab` (`setResourceVisibility` in
`utils/permissions/service.ts`).

**Backfill rule used** — `is_public=true` → `public`; else `organization_id` present → `internal`;
else `personal`. 9 / 192 / 8 rows.

**Verified live** by impersonating real RLS per user, before and after: **0 rows lost**, 73 gained,
0 RLS errors. Stranger and anon reach exactly the 9 public rows.

## THE BRIDGE — why nothing is broken today, and what it costs

`workbench._bridge_legacy_owner` (BEFORE INSERT OR UPDATE on all four) keeps
`created_by` ↔ `user_id` and `visibility` ↔ `is_public` in **exact agreement, both directions**.

That is deliberate and it is the only reason the unconverted consumers below still work. It also
means there is **no half-state**: whichever spelling a writer uses, both columns are correct
afterwards, and every reader — converted or not — sees the same truth. Two invariants hold across
all 209 rows and are worth re-asserting before the drop:

```sql
-- both must return 0
select count(*) from workbench.udt_documents where (visibility='public') <> coalesce(is_public,false);
select count(*) from workbench.udt_documents where created_by is distinct from user_id;
```

The cost is that the legacy columns still exist and can still be written. **This handoff is not
finished until they are gone.**

## What REMAINS

### 1. Frontend (~15 files)

Convert `user_id` → `created_by` and `is_public` → `visibility`. Already done:
`features/data-tables/document-service.ts`, `features/data-tables/workbook-service.ts`.

Remaining, by weight:

- `features/structured-lists/structured-list-manager-v3.tsx` (13 hits)
- `features/structured-lists/StructuredListManagerV1.tsx` (13) — **check first whether V1/V2/V3 are
  three live variants or two dead ones.** Three managers for one table smells like the
  component-duplication class; if V1/V2 are unreferenced, that is an unfinished-work question for
  Arman, NOT a delete-on-sight (see `policies/unfinished-work-alarm.md`).
- `features/structured-lists/useStructuredLists.ts` (10)
- `features/user-lists/actions/list-actions.ts` (7), `features/user-lists/service.ts` (6)
- `features/canvas/services/canvasArtifactService.ts` (6)
- `features/structured-lists/StructuredListManagerV2.tsx` (4)
- `utils/user-table-utls/table-utils.ts` (3), `features/data-tables/service.ts` (2)
- `app/(core)/lists/[id]/page.tsx` (2), `features/sharing/emailService.ts` (1),
  `features/data-tables/resolve-unique-dataset-name.ts` (1),
  `features/surfaces/manifests/documents.manifest.ts` (1),
  `app/(dev)/demos/lists-junk/v1/[id]/page.dev.tsx` (1)

Note the several `.eq("user_id", user.id)` list queries: converting them to `created_by` is the
mechanical half. The *interesting* half is that "my lists" is now a **scope decision** — per THE
VIEW LAW a list query declares its own scope, and these surfaces currently cannot show an
org-shared item at all. Use `lib/list-scope/`; do not just swap the column name and move on.

### 2. Database RPCs (~30)

Every function whose body references one of the four tables and reads/writes `user_id` /
`is_public`. Enumerate them fresh with:

```sql
select n.nspname||'.'||p.proname
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.prokind='f' and n.nspname not in ('pg_catalog','information_schema')
  and pg_get_functiondef(p.oid) ~* '(udt_workbooks|udt_documents|udt_datasets|udt_structured_lists)'
order by 1;
```

The ownership-critical ones (they gate on `user_id = auth.uid()`): `create_user_list`,
`update_user_list`, `get_user_list_with_items`, `get_user_lists_summary`,
`create_user_table_with_fields`, `create_new_user_table_dynamic`, `get_user_tables`,
`get_user_table_complete`, `update_user_table_metadata`, `udt_upsert_row`, `udt_upsert_cell`,
`udt_bulk_write`, `udt_change_field_type`, `udt_delete_field`, `udt_set_field_format`,
`update_user_table_config`, `update_user_table_default_sort`, `update_user_table_row_ordering`,
`add_data_row_to_user_table`, `append_rows_to_user_table`.
Also `inherit_table_security_on_insert` and `get_structured_list_for_selection` (is_public only).

### 3. aidream — the picklists router

`aidream/api/routers/picklists.py` is a substantial consumer: it projects `user_id`, enforces
ownership in Python (`_load_owned_picklist` compares `row["user_id"]`), and accepts
`is_public` + `public_read` in its request models. Its named SQL queries need the same conversion.

**`public_read` is a DIFFERENT column and is NOT part of this work.** It is picklist-specific and
has its own meaning; leave it alone.

### 4. The drop (only after 1–3)

Write `workbench_udt_canonical_step4_drop_legacy.sql`:

1. re-assert the two invariants above (fail loudly if either is non-zero);
2. `drop trigger _bridge_legacy_owner` on all four + `drop function workbench._bridge_legacy_owner()`;
3. `alter table … drop column user_id, drop column is_public` on all four;
4. `alter table … alter column visibility set default 'personal'` — the bridge was filling NULLs,
   so the column needs a real default once it is gone;
5. `pnpm db-types` here + `python db/generate.py` in aidream.

Order matters: the trigger must go before the columns, and step 4 must not be skipped or every
insert that omits `visibility` starts failing the NOT NULL.

## Known gap NOT covered here

Browser verification of the new visibility picker never happened: the dev server OOMs at ~45 GB
compiling `/documents` on this machine (the known build-fragmentation class, unrelated to this
change). The picker is covered by unit tests in
`utils/permissions/__tests__/service.visibility.test.ts` plus live per-state RLS proofs, but
nobody has clicked it. **Someone should open `/documents/<id>` → Share → Public and confirm the
three options render and persist.**
