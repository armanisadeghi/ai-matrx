# `udt_v2` cross-repo handoff → data-tables / frontend team

> **From:** the agent with `aidream` + `matrx-extend` access (audit run 2026-06-02).
> **To:** the data-tables agent who designed `udt_v2_backbone` and owns the next phases.
> **TL;DR:** Both sibling repos are audited and caught up. Nothing is broken. The dead-RPC
> drop is **4 RPCs, not 6** — two are live in the Chrome extension. Three small commits landed
> (one per repo). Open decisions and Phase-4 hooks are listed at the bottom. The companion
> [`CROSS_REPO_TASKS.md`](./CROSS_REPO_TASKS.md) has the per-item `file:line` evidence.

---

## 1. Status

| Repo | Audited? | Caught up? | Notes |
|---|---|---|---|
| `ai-matrx` (this repo) | ✅ (you, earlier) | n/a | source of the migration |
| `AI-Matrix-Engine/aidream` | ✅ this session | ✅ commit `40770d98` | heavy UDT writer; ORM already current |
| `armanisadeghi/matrx-extend` | ✅ this session | ✅ commit `8a932d2` | 2 RPCs live; reads + RPC writes only |
| `matrx-local` (Tauri desktop) | ❌ **NOT audited** | — | check before dropping any RPC |
| DB-internal SQL (functions/triggers calling the candidate RPCs) | ❌ **NOT audited** | — | check before dropping any RPC |

`udt_v2_backbone` is backwards-compatible by design (permissive validation = passthrough; version
triggers are audit-only), so neither sibling repo needed a functional fix. The catch-up commits are
schema-baseline / drift-guard / doc alignment only.

## 2. RPC keep/drop matrix (3 repos confirmed)

| RPC | ai-matrx | aidream | matrx-extend | Verdict |
|---|---|---|---|---|
| `create_user_table_with_fields` | none | none | **LIVE** `src/lib/supabase/user-tables.ts:157` | **KEEP** |
| `append_rows_to_user_table` | none | none | **LIVE** `src/lib/supabase/user-tables.ts:203` | **KEEP** |
| `batch_update_rows_in_user_table` | none | none | none | drop |
| `remove_column_from_user_table` | none | none | none | drop |
| `create_new_user_table` (bare) | none | none | none | drop |
| `create_new_user_table_wrapper` | none | none | none | drop |

The two KEEP RPCs power the extension's Structured-Data Showcase "save extracted rows to a dataset"
flow (`createUserTableFromSchema` + `appendRowsToUserTable`). In aidream both are zero-hits — aidream
uses its own `DatasetCreator` / named-SQL path instead. **This is exactly the expected outcome once a
second consumer repo was reviewed**, not a surprise.

**Before you drop the four:** confirm `matrx-local` and DB-internal callers (other SQL
functions/triggers doing `SELECT … create_new_user_table(...)`) are also clean, and update aidream's
`docs/UDT_MIGRATION_FOR_FRONTENDS.md:79-84`, which enumerates all six as a "names + signatures
preserved" contract.

## 3. Per-repo summary

### aidream (Python backend) — a primary UDT writer

- **Writes** udt_* via matrx-orm **named SQL** (`user_data/datasets_queries.py`,
  `picklists_queries.py`, orchestrated by `dataset_creator.py` / `picklist_creator.py`) plus one
  Supabase-client delete (`packages/matrx-ai/.../datasets_tools.py:427`). Agent tools expose
  create/add-rows/update/delete.
- **Trigger impact:** every row write now fires validate (permissive no-op) + version triggers.
  Direct-pool writes have no `auth.uid()` → **`changed_by = NULL`** in `udt_dataset_row_versions`;
  only the JWT-carrying client delete attributes a user. Bulk import (`datasets_add_rows_batch`) is
  one multi-row INSERT but realtime fans out per row.
- **Already current:** the ORM (`db/models.py`) was regenerated 2026-06-02 and carries `UdtWorkbooks`,
  `UdtDatasetRowVersions`, and the new `udt_datasets` columns. No regen needed.
- **Will NOT adopt the new write RPCs** for its pool path — they're `auth.uid()`-gated `SECURITY
  DEFINER`, unsuitable for trusted-backend writes that have no JWT context. The direct path already
  scopes `user_id`.

### matrx-extend (Chrome extension) — JWT-authed RPC writer

- **Reads** `udt_datasets` / `udt_dataset_fields`; **writes** only via the two KEEP RPCs, always with
  the user JWT (`getSupabase()`, `security_invoker`) → `changed_by` correctly attributed.
- **Clip-to-dataset entry points:** `src/features/showcase/tabs/TablesTab.tsx` (extract HTML tables)
  → `src/features/showcase/components/SaveAsPattern.tsx:77-87` (create) / `:111-112` (append). This is
  the hook for Phase-4 workbook routing.
- **No generated Supabase types** — manual Zod schemas (`user-tables.ts:73-96`), pre-v2 but functional
  (they only model the tables the extension touches).
- Tests: `vitest run` → **39 passed / 0 failed**. No UDT tests; no "1 write = silence" assertion.

## 4. What changed this session (3 commits, one per repo)

| Repo | Commit | Change |
|---|---|---|
| aidream | `40770d98` | `schema_check.py CRITICAL_TABLES` + `db/expected_schema.json` add the 2 v2 tables and the 3 new `udt_datasets` columns (live column lists); `docs/UDT_API_REFERENCE.md` gains a v2 note (workbooks, append-only history, `changed_by=NULL` on pool writes, permissive default). No ORM regen (already current); no migration mirror (DB-as-source-of-truth). |
| matrx-extend | `8a932d2` | `src/lib/supabase/user-tables.ts` header comment documents the v2 backbone (transparent to the 2 RPCs; flags the 4 unused RPCs as "do not start calling — slated for removal"). No functional change. |
| matrx-frontend | (this commit) | `CROSS_REPO_TASKS.md` filled in with `file:line` findings; this `CROSS_REPO_HANDOFF.md` added. |

## 5. Open decisions / next-phase hooks (your call)

1. **Drop the 4 confirmed-dead RPCs** once `matrx-local` + DB-internal callers are verified clean.
   Pair the drop with an update to aidream `docs/UDT_MIGRATION_FOR_FRONTENDS.md:79-84`.
2. **Backend audit attribution.** aidream's pool writes record `changed_by = NULL`. Decide: honest NULL
   (it genuinely wasn't a user-JWT write) or attribute the originating user via
   `set_config('request.jwt.claims', …)` before the write (the pattern in your migration's verification
   tests). No aidream change is in flight either way — this is a product decision.
3. **Phase-4 workbook surface.** The extension's clip-to-spreadsheet flow (`SaveAsPattern` + `TablesTab`)
   currently lands in typed `udt_datasets`. When the workbook UI ships, re-route imported-from-one-source
   clips into `udt_workbooks`. The extension team will wire its side once the contract exists.
4. **Realtime fanout on bulk import.** aidream's batch insert emits one event per row. If the workbook
   import path will move large sheets, consider `udt_bulk_write` or batching the realtime side; not
   urgent at current volumes.

## 6. Index

- Filled checklist with all `file:line` evidence: [`CROSS_REPO_TASKS.md`](./CROSS_REPO_TASKS.md)
- aidream keep-vs-drop call sites: `packages/matrx-ai/matrx_ai/tools/implementations/datasets_tools.py`,
  `user_data/datasets_queries.py`, `user_data/picklists_queries.py`
- matrx-extend RPC call sites: `src/lib/supabase/user-tables.ts:157,203`
- Live udt column lists (queried 2026-06-02 from `txzxabzwovsujtloxrus`) are baked into aidream
  `db/expected_schema.json` for `udt_datasets`, `udt_workbooks`, `udt_dataset_row_versions`.
