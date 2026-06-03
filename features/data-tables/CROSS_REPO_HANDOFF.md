# `udt_v2` cross-repo handoff → data-tables / frontend team

> **From:** pass-1 agent (`aidream` + `matrx-extend` access, 2026-06-02) → **pass-2 agent**
> (`matrx-local` checkout **+ Supabase MCP** on `txzxabzwovsujtloxrus`, same day) closed the two
> gaps pass 1 could not reach and re-verified everything against the live DB.
> **To:** the data-tables agent who designed `udt_v2_backbone` and owns the next phases.
> **TL;DR:** All four repos **and** the database internals are audited. Nothing is broken. The
> dead-RPC drop is **4 RPCs, not 6** (two are live in the Chrome extension) and is now **fully
> unblocked** — `matrx-local` is clean, there are **zero** DB-internal callers of the four, and
> `pg_depend` shows **zero** hard dependencies. A ready-to-run, reversible DROP migration is in §7.
> The companion [`CROSS_REPO_TASKS.md`](./CROSS_REPO_TASKS.md) has the per-item `file:line` evidence
> (Sections A–E).

---

## 1. Status — all gates green

| Repo / surface | Audited? | Caught up? | Notes |
|---|---|---|---|
| `ai-matrx` (this repo, `armanisadeghi/ai-matrx`) | ✅ pass 1 + re-verified pass 2 | n/a | source of the migration; RPCs are **types-only** (no call sites) |
| `AI-Matrix-Engine/aidream` (Python backend) | ✅ pass 1 + re-verified pass 2 | ✅ commit `40770d98` | heavy UDT writer; ORM already current |
| `armanisadeghi/matrx-extend` (Chrome ext) | ✅ pass 1 + re-verified pass 2 | ✅ commit `8a932d2` | 2 RPCs live; reads + RPC writes only |
| `armanisadeghi/matrx-local` (Tauri desktop) | ✅ **pass 2** | ✅ no change needed | **zero** UDT/RPC/dataset references anywhere |
| DB-internal SQL (functions / triggers / views / RLS) | ✅ **pass 2** (Supabase MCP) | ✅ no change needed | only intra-set caller; zero `pg_depend` deps |

`udt_v2_backbone` is backwards-compatible by design (permissive validation = passthrough; version
triggers are audit-only), so **no** repo needed a functional fix. The catch-up commits are
schema-baseline / drift-guard / doc-alignment only. Pass-2 added no code changes to any repo — only
this audit close-out and the docs in `features/data-tables/`.

## 2. RPC keep/drop matrix (4 repos + DB internals — final)

| RPC | live signature | ai-matrx | aidream | matrx-extend | matrx-local | DB-internal | Verdict |
|---|---|---|---|---|---|---|---|
| `create_user_table_with_fields` | `(text,text,boolean,uuid,uuid,uuid,jsonb)` | types-only | none | **LIVE** `user-tables.ts:167` | none | none | **KEEP** |
| `append_rows_to_user_table` | `(uuid,jsonb)` | types-only | none | **LIVE** `user-tables.ts:213` | none | none | **KEEP** |
| `batch_update_rows_in_user_table` | `(uuid,jsonb)` | types-only | none | none | none | none | **DROP** |
| `remove_column_from_user_table` | `(uuid,uuid)` | types-only | none | none | none | none | **DROP** |
| `create_new_user_table` (bare) | `(text,text,boolean,boolean,jsonb)` | types-only | none | none | none | only `_wrapper` (intra-set) | **DROP** |
| `create_new_user_table_wrapper` | `(text,text,boolean,boolean,jsonb)` | types-only | none | none | none | none | **DROP** |

Legend / caveats:
- **types-only** — the name is present in ai-matrx's generated `types/database.types.ts`
  (lines 23909–27165) as a typed `Functions` entry, **never as a `.rpc()` call**. ⚠️ **That file goes
  stale on the drop** — regenerate Supabase types in ai-matrx afterwards (and in any consumer that
  pins generated types).
- **aidream `none`** — **zero call sites for all 6.** The names exist in aidream only as `CREATE
  FUNCTION` statements in the **origin** migration `db/migrations/0011_udt_rename_and_rpc_consolidation.sql`
  (drops: `batch_update` `:328`, bare `create_new_user_table` `:370`, `remove_column` `:1304`; keeps:
  `append_rows_to_user_table` `:284`, `create_user_table_with_fields` `:529`) plus one *test comment*
  (`user_data/registered_functions.py:620`). `create_new_user_table_wrapper` is **absent from aidream
  entirely** (not in 0011). Relevance: a fresh-DB rebuild from aidream migrations would recreate the 5
  it defines — so the drop must live in the ai-matrx schema-of-record (§7).
- **matrx-extend lines** — `:167` / `:213` are the actual `.rpc(...)` calls; the JSDoc/function
  declarations the pass-1 doc cited (`:157` / `:203`) sit a few lines above each call.

> ### ⚠️ Footgun: do **NOT** drop `create_new_user_table_dynamic`
> There is a **third** member of the family — `create_new_user_table_dynamic(text,text,boolean,boolean,jsonb)`
> — that is **not** a drop candidate. It is the **live canonical create path** (snake-cases field
> names, dup-checks, validates the `field_data_type` enum), called at ai-matrx
> `utils/user-table-utls/table-utils.ts:194` and defined at aidream `0011:429`. The bare
> `create_new_user_table` and `create_new_user_table_wrapper` are legacy stubs that the product no
> longer calls. **Drop the bare + `_wrapper` only; keep `_dynamic`.** A loose
> `DROP … create_new_user_table%` would break table creation platform-wide.

The two KEEP RPCs power the extension's Structured-Data Showcase "save extracted rows to a dataset"
flow (`createUserTableFromSchema` → `create_user_table_with_fields`; `appendRowsToUserTable` →
`append_rows_to_user_table`). In aidream both are zero-hits — aidream uses its own
`DatasetCreator` / named-SQL path instead. This is the expected outcome once a second consumer repo
was reviewed, not a surprise.

## 3. Per-repo summary

### aidream (Python backend) — a primary UDT writer
- **Writes** udt_* via matrx-orm **named SQL** (`user_data/datasets_queries.py`,
  `picklists_queries.py`, orchestrated by `dataset_creator.py` / `picklist_creator.py`) plus one
  Supabase-client delete (`packages/matrx-ai/.../datasets_tools.py:427`). Agent tools expose
  create / add-rows / update / delete.
- **Trigger impact:** every row write now fires validate (permissive no-op) + version triggers.
  Direct-pool writes have no `auth.uid()` → **`changed_by = NULL`** in `udt_dataset_row_versions`;
  only the JWT-carrying client delete attributes a user. Bulk import (`datasets_add_rows_batch`) is
  one multi-row INSERT but realtime fans out per row.
- **Already current:** the ORM (`db/models.py`) was regenerated 2026-06-02 and carries `UdtWorkbooks`,
  `UdtDatasetRowVersions`, and the new `udt_datasets` columns. No regen needed.
- **Will NOT adopt the new write RPCs** for its pool path — they're `auth.uid()`-gated `SECURITY
  DEFINER`, unsuitable for trusted-backend writes that have no JWT context. The direct path already
  scopes `user_id`.
- None of the 6 candidate RPCs is called from aidream — confirmed by independent re-grep
  (only the origin migration 0011 + a test comment reference the names).

### matrx-extend (Chrome extension) — JWT-authed RPC writer
- **Reads** `udt_datasets` / `udt_dataset_fields`; **writes** only via the two KEEP RPCs, always with
  the user JWT (`getSupabase()`, `security_invoker`) → `changed_by` correctly attributed.
- **Clip-to-dataset entry points:** `src/features/showcase/tabs/TablesTab.tsx` (extract HTML tables)
  → `src/features/showcase/components/SaveAsPattern.tsx:77-87` (create) / `:111-112` (append). This is
  the hook for Phase-4 workbook routing.
- The 4 drop candidates appear **only** in the explanatory header comment added by commit `8a932d2`
  (`user-tables.ts:26-27`), never as calls.
- **No generated Supabase types** — manual Zod schemas (`user-tables.ts:73-96`), pre-v2 but functional
  (they only model the tables the extension touches).
- Tests: `vitest run` → **39 passed / 0 failed**. No UDT tests; no "1 write = silence" assertion.

### matrx-local (Tauri desktop) — **NOT a UDT consumer** *(pass 2)*
- **Zero** references to any of the 6 RPCs, any `udt_*` table, or `dataset`/`picklist` anywhere in the
  repo — TS/TSX frontend, Rust `src-tauri`, and Python `app/`.
- It *does* embed a Supabase client (`desktop/src/lib/supabase.ts`, built from `VITE_SUPABASE_URL` +
  publishable key), but `desktop/src` issues **no** `.rpc(...)` and **no** `.from('udt_*')` calls — the
  client is auth-only. Rust mentions Supabase solely in an OAuth-callback comment (`lib.rs:1645`).
- **Cannot keep any candidate alive.** No code change, no doc change.

### ai-matrx (this repo) — types-only, regen after drop *(pass 2 refinement)*
- The only place the 6 names appear is the generated `types/database.types.ts` (type entries, not
  calls). The lone runtime UDT-create call is to `create_new_user_table_dynamic`
  (`utils/user-table-utls/table-utils.ts:194`) — the KEEP function, not a candidate.
- ⚠️ After the drop, `types/database.types.ts` will still advertise the 4 removed RPCs (and their now
  absent siblings). **Regenerate it** so the TS surface matches the DB.

## 4. Live-DB verification snapshot — `txzxabzwovsujtloxrus`, queried 2026-06-02 *(pass 2)*

Proof the `udt_v2_backbone` migration is genuinely applied (not just a file on disk), and proof the
drop is safe:

**v2 schema is live**
- Tables present: `udt_workbooks` ✅, `udt_dataset_row_versions` ✅ (+ the 5 pre-existing udt tables).
- `udt_datasets` new columns: `validation_mode text DEFAULT 'permissive'` ✅, `workbook_id uuid` ✅,
  `version int DEFAULT 1` ✅ (alongside pre-existing `organization_id` / `project_id` / `task_id` /
  `sheet_index` / `row_ordering_config`).
- `udt_dataset_rows` triggers: `udt_dataset_rows_validate` (BEFORE INS/UPD → `udt_dataset_rows_validate_trigger`)
  ✅; `udt_dataset_rows_version_{insert,update,delete}` (AFTER → `udt_log_row_version`) ✅; plus the
  pre-existing `trigger_inherit_security_udt_dataset_rows` (BEFORE INS).
- New write RPCs (all `SECURITY DEFINER`): `udt_upsert_row(uuid,uuid,jsonb)` ✅,
  `udt_upsert_cell(uuid,uuid,text,jsonb)` ✅, `udt_bulk_write(uuid,jsonb)` ✅,
  `udt_change_field_type(uuid,uuid,field_data_type,text)` ✅; validation helper
  `udt_validate_row(uuid,jsonb,jsonb)` (invoker) ✅.
- Realtime: `udt_datasets`, `udt_dataset_fields`, `udt_dataset_rows`, `udt_workbooks` all in the
  `supabase_realtime` publication ✅ (the 10k-row-write = 10k-event fanout noted by pass 1 is real).

**Drop safety (the four candidates)**
- **Function-body callers:** exactly one — `create_new_user_table_wrapper → create_new_user_table`
  (intra-set; both dropped together). No other function, **including `create_new_user_table_dynamic`**,
  references any candidate.
- **Views:** zero references. **RLS policies:** zero references.
- **`pg_depend` hard deps on the 4:** zero. The drop cascades to nothing.

## 5. What changed this session

| Repo | Commit | Change |
|---|---|---|
| aidream | `40770d98` (pass 1) | `schema_check.py CRITICAL_TABLES` (`:78-79`) + `db/expected_schema.json` add the 2 v2 tables + the new `udt_datasets` columns; `docs/UDT_API_REFERENCE.md:21-30` gains a v2 note. No ORM regen (already current); no migration mirror (DB-as-source-of-truth). **Independently re-verified pass 2.** |
| matrx-extend | `8a932d2` (pass 1) | `src/lib/supabase/user-tables.ts` header comment documents the v2 backbone + flags the 4 unused RPCs as "do not start calling — slated for removal." No functional change. **Re-verified pass 2.** |
| matrx-frontend | (pass 1 + pass 2, this working tree) | pass 1 added `CROSS_REPO_TASKS.md` + `CROSS_REPO_HANDOFF.md`. **Pass 2** closed the `matrx-local` + DB-internal gaps (Sections D & E), added the live-DB snapshot (§4), the `_dynamic` footgun, the types-regen note, exact `.rpc()` lines, and the reversible drop migration (§7). |
| matrx-local | none | clean; no change required. |

## 6. Exact live RPC signatures (for the drop + for type regen)

```
-- KEEP
create_user_table_with_fields(text, text, boolean, uuid, uuid, uuid, jsonb)   security_invoker
append_rows_to_user_table(uuid, jsonb)                                        security_invoker
create_new_user_table_dynamic(text, text, boolean, boolean, jsonb)            SECURITY DEFINER   -- canonical create, KEEP

-- DROP
batch_update_rows_in_user_table(uuid, jsonb)                                  security_invoker
remove_column_from_user_table(uuid, uuid)                                     security_invoker
create_new_user_table(text, text, boolean, boolean, jsonb)                    SECURITY DEFINER
create_new_user_table_wrapper(text, text, boolean, boolean, jsonb)            SECURITY DEFINER
```
All seven are owned by `postgres` and granted `EXECUTE` to `anon`, `authenticated`, `service_role`.

## 7. Ready-to-run reversible DROP migration (the artifact)

Run as a single statement in a migration on the **ai-matrx schema-of-record** (not aidream — its
migrations are reverse-engineered; see `CROSS_REPO_TASKS.md` A4.1). Drop `_wrapper` first for
tidiness (plpgsql late-binds, so order is not strictly required and there is no `RESTRICT` blocker —
`pg_depend` is empty).

```sql
-- forward (drop the 4 confirmed-dead legacy RPCs; KEEPs and _dynamic untouched)
DROP FUNCTION IF EXISTS public.create_new_user_table_wrapper(text, text, boolean, boolean, jsonb);
DROP FUNCTION IF EXISTS public.create_new_user_table(text, text, boolean, boolean, jsonb);
DROP FUNCTION IF EXISTS public.batch_update_rows_in_user_table(uuid, jsonb);
DROP FUNCTION IF EXISTS public.remove_column_from_user_table(uuid, uuid);
```

**After the drop:** (a) regenerate ai-matrx `types/database.types.ts`; (b) update aidream
`docs/UDT_MIGRATION_FOR_FRONTENDS.md` — its "**33 RPCs … names and signatures are identical, nothing
to change**" contract (`:23`, `:73-88`) lists 3 of the 4 (`:79` `remove_column_from_user_table`,
`:80` `batch_update_rows_in_user_table`, `:81` `create_new_user_table`); after the drop it is **29
RPCs**, and the "identical contract / no change needed" assertion must be qualified for the removed
names. (`create_new_user_table_wrapper` is **not** listed in that doc, so removing it touches nothing
there.)

**Rollback.** 3 of the 4 originals are recoverable verbatim from aidream
`db/migrations/0011_udt_rename_and_rpc_consolidation.sql` — `batch_update_rows_in_user_table` `:328`,
`create_new_user_table` `:370`, `remove_column_from_user_table` `:1304`. The fourth,
`create_new_user_table_wrapper`, is **not** in 0011; its exact live body (captured 2026-06-02) is:

```sql
CREATE OR REPLACE FUNCTION public.create_new_user_table_wrapper(
    p_table_name text, p_description text, p_is_public boolean,
    p_authenticated_read boolean DEFAULT false, p_initial_fields jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_result JSONB; v_converted_fields JSONB := '[]'::jsonb; v_field JSONB; v_data_type public.field_data_type;
BEGIN
    IF p_initial_fields IS NOT NULL AND jsonb_array_length(p_initial_fields) > 0 THEN
        FOR v_field IN SELECT * FROM jsonb_array_elements(p_initial_fields) LOOP
            EXECUTE format('SELECT %L::public.field_data_type', v_field->>'data_type') INTO v_data_type;
            v_converted_fields := v_converted_fields || jsonb_build_object(
                'field_name', v_field->>'field_name', 'display_name', v_field->>'display_name',
                'data_type', v_data_type, 'field_order', COALESCE((v_field->>'field_order')::INT, 0),
                'is_required', COALESCE((v_field->>'is_required')::BOOLEAN, FALSE),
                'default_value', COALESCE(v_field->'default_value', 'null'::jsonb),
                'validation_rules', COALESCE(v_field->'validation_rules', 'null'::jsonb));
        END LOOP;
    END IF;
    v_result := public.create_new_user_table(p_table_name, p_description, p_is_public, p_authenticated_read, v_converted_fields);
    RETURN v_result;
END; $function$;
```
(Note the rollback dependency: `_wrapper` calls the bare `create_new_user_table`, so recreate the bare
one first if you ever roll back both.)

## 8. Open decisions / next-phase hooks (your call)

1. **Drop the 4 confirmed-dead RPCs — UNBLOCKED.** Every prerequisite pass 1 listed is now met:
   `matrx-local` clean, zero DB-internal callers, zero `pg_depend` deps. Run §7, then regen ai-matrx
   types and update aidream's `UDT_MIGRATION_FOR_FRONTENDS.md` contract section. **Keep
   `create_new_user_table_dynamic`.**
2. **Backend audit attribution.** aidream's pool writes record `changed_by = NULL`. Decide: honest NULL
   (it genuinely wasn't a user-JWT write) or attribute the originating user via
   `set_config('request.jwt.claims', …)` before the write (the pattern in your migration's verification
   tests). No aidream change is in flight either way — a product decision.
3. **Phase-4 workbook surface.** The extension's clip-to-spreadsheet flow (`SaveAsPattern` + `TablesTab`)
   currently lands in typed `udt_datasets`. When the workbook UI ships, re-route imported-from-one-source
   clips into `udt_workbooks`. The extension team wires its side once the contract exists.
4. **Realtime fanout on bulk import.** aidream's batch insert emits one event per row (confirmed: all 4
   tables are in `supabase_realtime`). If the workbook import path will move large sheets, consider
   `udt_bulk_write` or batching the realtime side; not urgent at current volumes.

## 9. Index

- Filled checklist with all `file:line` evidence (Sections A–E): [`CROSS_REPO_TASKS.md`](./CROSS_REPO_TASKS.md)
- aidream keep-vs-drop call sites: `packages/matrx-ai/matrx_ai/tools/implementations/datasets_tools.py`,
  `user_data/datasets_queries.py`, `user_data/picklists_queries.py`; origin defs in
  `db/migrations/0011_udt_rename_and_rpc_consolidation.sql`
- matrx-extend KEEP `.rpc()` call sites: `src/lib/supabase/user-tables.ts:167,213`
- ai-matrx canonical create call: `utils/user-table-utls/table-utils.ts:194` (`create_new_user_table_dynamic`)
- matrx-local Supabase client (auth-only, no UDT): `desktop/src/lib/supabase.ts`
- Live udt column lists / verification baked into aidream `db/expected_schema.json` for `udt_datasets`,
  `udt_workbooks`, `udt_dataset_row_versions` (commit `40770d98`)
