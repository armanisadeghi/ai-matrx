# FEATURE.md — `data-tables` (User Data Tables / `udt_*`)

**Status:** `migrating`
**Tier:** `1`
**Last updated:** `2026-06-03`

---

## Active pending list (single source of truth)

> ✅ done · ⏳ pending · 🚧 in progress · 🛑 blocked on user decision

**Data layer (DB):**
- ✅ `udt_v2_backbone` migration — workbooks, version history, validation, 4 agent RPCs
- ✅ Hardening v1 + v2 + signature fix (4 reviewer-found bugs)
- ✅ Dead-RPC drop (4 of 6; 2 kept because matrx-extend uses them)
- ✅ Cross-repo audit (aidream + matrx-extend + matrx-local + DB internals)
- ✅ Types regenerated to current live DB

**Typed TS service layer:**
- ✅ `service.ts` — `upsertRow / upsertCell / bulkWrite / changeFieldType`
- ✅ `types.ts` — 22 domain types + `isBulkOpError` / `isServiceFailure` guards
- ✅ `useRowVersions` hook + `VersionHistoryViewer` component
- ✅ `useTableRealtime` hook — Postgres Changes subscription per tableId
- ✅ `EditableCell` component — double-click inline editing per cell

**Frontend wired through new primitives:**
- ✅ Wave D — `ImportTableModal`: serial loop → one atomic `bulkWrite`
- ✅ Wave F — `UserTableViewer`: row-action `History` icon → Sheet with `VersionHistoryViewer`
- ✅ Wave B (4 of 4) — `EditRowModal` → `upsertRow`; `UserTableViewer` HTML cleanup + expanded-text save → `upsertCell`; bulk HTML-cleanup loop → `bulkWrite({op:'merge'})`
- ✅ Wave G — `TableSettingsModal`: strict-mode toggle persisting `validation_mode`
- ✅ **Inline cell editing** — every `UserTableViewer` cell now wraps in `EditableCell` (double-click → type-aware input → `upsertCell` → success or toast)
- ✅ **Realtime sync** — `UserTableViewer` subscribes to `udt_dataset_rows` changes for its tableId; debounced 400ms refetch
- ✅ **Column-type badges** — every header now shows the `data_type` under the display name
- ✅ **`op:'merge'` in `udt_bulk_write`** — applied live + verified; partial-row patch via `jsonb_concat`

**P4 workbook surface (lossless spreadsheet, v1):**
- ✅ `udt_workbook_snapshots` table — append-only content store keyed by `workbook_id`; RLS mirrors `udt_workbooks`; viewers see all snapshots they can view the parent of; editors can append; in `supabase_realtime` publication.
- ✅ `workbook-service.ts` — `createWorkbook` / `listAccessibleWorkbooks` / `getWorkbook` / `renameWorkbook` / `deleteWorkbook` / `getLatestSnapshot` / `saveSnapshot` / `listSnapshots`.
- ✅ `useWorkbookRealtime` hook — Postgres-Changes subscription for `udt_workbook_snapshots` filtered by `workbook_id`.
- ✅ `WorkbookEditor` component — mounts Univer (`@univerjs/presets` + `@univerjs/preset-sheets-core`), hydrates from latest snapshot, debounces autosave (2.5s after last edit), hot-swaps on remote snapshots from other users; ignores echo of own writes. Status pill shows idle / dirty / saving / saved / error.
- ✅ Routes — `/workbooks` (list + create + delete), `/workbooks/[id]` (open + rename + edit). Editor is dynamically imported with `ssr:false` so Univer never runs server-side.
- ⏳ **V2 work — full CRDT collab** (per-cell deltas, presence cursors, formal conflict resolution). V1 is last-write-wins on the snapshot row, which is the standard MVP pattern. CRDT layer can build on the snapshot store without changing it.

**Pending — user decision blockers (🛑):**
- 🛑 **Wave H — version-history retention policy.** 3 options listed below; pick one before agent-heavy workloads land.
- 🛑 **aidream backend audit attribution.** aidream's pool writes record `changed_by = NULL` (no JWT). Decide: keep honest NULL, or attribute the originating user via `set_config('request.jwt.claims', ...)` before each write.
- 🛑 **CRDT-collab commitment.** P4 v1 ships last-write-wins. The honest "full collab from day one" answer requires picking a CRDT (Yjs is the obvious choice via Univer's `@univerjs/sheets-collaboration` preset). Confirm intent before I integrate.

**Pending — needs UX design (⏳):**
- ⏳ **Wave E — column type-change UI.** Need confirmation dialog, strategy picker (`cast_or_null` vs `cast_or_skip`), progress feedback for long row-rewrites. RPC already live and tested.
- ⏳ **Wave P3 — smart importer (XLSX → typed dataset vs workbook).** Detects "rational" (header-row + uniform-type columns) vs "look-sensitive" (merged cells, formulas, multi-region) and routes the upload to `udt_datasets` or `udt_workbooks` accordingly. P4 v1 makes this fully unblocked.

**Pending — small + clear (🚧 ready when you say go):**
- 🚧 **Bulk paste from Excel / Sheets clipboard** into the typed-dataset grid.
- 🚧 **"Save now" + named-snapshot UI** in the workbook editor toolbar (currently autosave-only; the underlying `saveSnapshot` already accepts `label` + `origin:'manual'`).
- 🚧 **Snapshot-history viewer** for workbooks (mirror of `VersionHistoryViewer` for rows; uses `listSnapshots`).
- 🚧 **Import XLSX → workbook** path (`ImportTableModal` route fork).

---

## Purpose

User-authored structured data: typed, row-per-object datasets ("user data tables") that
users create, import, edit, share, and that agents read and write. Backed by the `udt_*`
Supabase tables. This is the data backbone for the spreadsheet/UX initiative — the place a
spreadsheet, an imported CSV/XLSX, or an agent-maintained list of records lives.

> **Code is currently scattered, not yet consolidated into this feature dir.** This doc is
> the single source of truth for the *system*; the code lives in three places (see Entry
> points). Consolidating it under `features/data-tables/` is tracked tech debt.

---

## Two complementary storage models

| Model | Table family | Shape | Best for | Phase |
|---|---|---|---|---|
| **Typed datasets** | `udt_datasets` + `udt_dataset_fields` + `udt_dataset_rows` | One row per object; each cell a JSONB value keyed by a first-class field | Queryable/indexable data, agent reads & writes, per-row sharing, "rational" tabular data | live (this doc) |
| **Workbooks** | `udt_workbooks` (+ a future per-workbook Univer snapshot) | Faithful Excel/Sheets reproduction stored losslessly | Preserving the original look of an uploaded spreadsheet (merged cells, formulas, formatting) | P4 |

The **smart importer (P3)** inspects an uploaded file and routes it: rational sheets → typed
datasets (lossy, queryable); look-sensitive sheets → workbook snapshot (lossless). A workbook
groups N datasets via `udt_datasets.workbook_id`, so one uploaded `.xlsx` with 5 tabs can
become 5 linked datasets under one workbook.

---

## Entry points

**Routes**
- `app/(core)/data/page.tsx` — list all of the user's datasets (`/data`)
- `app/(core)/data/[id]/page.tsx` — view/edit a single dataset (`/data/{id}`)
- `app/(core)/data/create/page.tsx` — create a dataset (`/data/create`)
- `app/(core)/data/layout.tsx` — data section shell
- `app/(core)/organizations/[orgId]/tables/page.tsx` — org-scoped dataset list
- `/workbooks/{id}` — **reserved for P4** (registered in `shareable_resource_registry`, no route yet)

**UI components**
- `components/user-generated-table-data/` — the dataset UI layer (~21 files): `UserTableViewer.tsx`,
  `CreateTableModal.tsx`, `EditTableModal.tsx`, `TableConfigModal.tsx`, `AddRowModal.tsx`,
  `EditRowModal.tsx`, `DeleteRowModal.tsx`, `AddColumnModal.tsx`, `ImportTableModal.tsx`,
  `ExportTableModal.tsx`, `TableCards.tsx`, `TableListItem.tsx`
- `features/udt-picklist/` — picklist (dropdown) management: `PicklistLanding.tsx`,
  `PicklistManagerV1/V2/V3.tsx`, `usePicklists.ts`
- `features/data-tables/components/VersionHistoryViewer.tsx` — read-only row audit log;
  consumes `useRowVersions`. Drop into any sheet/dialog/inline panel that wants to show
  a single row's edit history. Renders insert/update/delete with key-level diffs, honours
  `changed_by = NULL` as "System".

**Services / business logic**
- `utils/user-tables-rpc.ts` — RPC response unwrapping (`unwrapGetUserTableComplete`,
  `unwrapGetUserTables`, `unwrapSuccessEnvelope`)
- `utils/user-table-utls/table-utils.ts` — `createTable()`, `addRow()`, `FieldDefinition`,
  `TableField`, `VALID_DATA_TYPES`
- `utils/user-table-utls/type-inference.ts` — `inferDataType()`, `analyzeData()` (used by import)
- `utils/user-table-utls/field-name-sanitizer.ts`, `template-utils.ts`, `sample-data.ts`
- `features/resource-manager/resource-picker/TablesResourcePicker.tsx` — pick a dataset as a resource
- `app/api/export/email-table/route.ts` — email-export (Next API; admin/email concern)

**Redux slice(s)**
- **None.** All reads/writes go directly to Supabase (`supabase.from('udt_*')` + `.rpc()`),
  inline in components. (Doctrine note: a slice is *not* warranted yet — there is no shared
  cross-route dataset state. Revisit if realtime collab needs a normalized cache.)

---

## Data model

**Database tables** (Supabase, project `txzxabzwovsujtloxrus`)
- `udt_datasets` — one row per dataset. Owner `user_id`; `is_public`; optional `organization_id` /
  `project_id` / `task_id` scoping. **New (P1):** `workbook_id` (FK → `udt_workbooks`,
  ON DELETE SET NULL), `sheet_index`, `validation_mode` (`'permissive'` default | `'strict'`).
- `udt_dataset_fields` — column definitions. `field_name`, `display_name`, `data_type`
  (`field_data_type` enum: `string|number|integer|boolean|date|datetime|json|array`),
  `field_order`, `is_required`, `default_value`, `validation_rules`.
- `udt_dataset_rows` — one row per record; `data` JSONB keyed by `field_name`.
- `udt_workbooks` — **New (P1).** Groups datasets imported from one source. `source`
  (`workbook_source` enum), `original_file_id`, standard owner/scope/`is_public` columns.
- `udt_dataset_row_versions` — **New (P1).** Append-only history: `(row_id, table_id, data,
  prior_data, change_kind, changed_by, changed_at)`. Written by trigger on every row mutation.
- `udt_picklists` / `udt_picklist_items` — reusable dropdown lists.

**RLS** — `udt_datasets` / `udt_workbooks` SELECT = owner OR `is_public` OR
`has_permission(<table>, id, 'viewer')`; UPDATE = owner OR `has_permission(..,'editor')`.
Fields/rows inherit via an EXISTS check against the parent dataset. Sharing integrates with
the `shareable_resource_registry` (both `udt_datasets` and `udt_workbooks` are registered).

**RPCs**
- *Pre-existing:* `get_user_tables`, `get_user_table_complete`, `create_new_user_table*`
  (3 overlapping variants — tech debt), `add_data_row_to_user_table`, `append_rows_to_user_table`
  (bulk), `batch_update_rows_in_user_table`, `update_data_row_in_user_table`,
  `delete_data_row_from_user_table`, `add_column_to_user_table`, `remove_column_from_user_table`,
  `update_user_table_*`, `export_user_table_as_csv`, `get_user_table_data_paginated_v2`.
- *New (P1), all `SECURITY DEFINER`, owner-or-editor gated, `authenticated`+`service_role` only:*
  - `udt_upsert_row(p_table_id, p_row_id, p_data)` — insert if `row_id` NULL, else update.
  - `udt_upsert_cell(p_table_id, p_row_id, p_field_name, p_value)` — surgical `jsonb_set` write.
  - `udt_bulk_write(p_table_id, p_operations jsonb[])` — one txn; ops `insert|update|cell|delete`.
  - `udt_change_field_type(p_table_id, p_field_id, p_new_type, p_strategy)` — rewrites every
    row's JSONB cell; strategy `cast_or_null` (default) or `cast_or_skip`.

**Key types**
- Generated Supabase types: `types/database.types.ts` (regenerate with `pnpm db-types`).
- Hand types: `FieldDefinition` / `TableField` / `VALID_DATA_TYPES` (`utils/user-table-utls/table-utils.ts`),
  `UnwrappedUserTableComplete` (`utils/user-tables-rpc.ts`).

---

## Key flows

**1. Agent writes a cell (the reason P1 exists)**
- Trigger: an agent/tool decides to set one field on one record.
- Path: client → `supabase.rpc('udt_upsert_cell', { p_table_id, p_row_id, p_field_name, p_value })`.
- The RPC checks owner-or-editor, confirms the field exists, `jsonb_set`s the cell, bumps `updated_at`.
- Side effects: BEFORE-trigger `udt_validate_row` runs (no-op in permissive); AFTER-trigger
  `udt_log_row_version` appends an `update` version row; the row change broadcasts via realtime.
- Exit: returns the full updated row as JSONB.

**2. Bulk import of N rows**
- Trigger: importer parsed a file into rows.
- Path: `udt_bulk_write(table_id, [{op:'insert', data:{...}}, ...])` — single transaction.
- Side effects: one version row per insert; one realtime event per row (see gotchas).
- Exit: `{ table_id, count, results[] }`.

**3. Change a column's type**
- Trigger: user changes a field from `string` to `integer` in the column editor.
- Path: `udt_change_field_type(table_id, field_id, 'integer', 'cast_or_null')`.
- Walks every row, rewrites the JSONB cell (regex-validates then casts; un-castable → null or
  skip per strategy), then flips `udt_dataset_fields.data_type`.
- Exit: `{ field_id, new_type, strategy, rows_rewritten }`.

**4. Validation enforcement (opt-in)**
- Trigger: a dataset is set to `validation_mode='strict'` (new imports may default to strict).
- Path: every INSERT / UPDATE OF data on `udt_dataset_rows` calls `udt_validate_row(table, new, old)`.
- Permissive → returns immediately (no enforcement). Strict → required fields present (with
  grandfathering — see gotchas) + per-cell type checks.
- Exit: passes (write proceeds) or `RAISE EXCEPTION` (write aborts).

---

## Invariants & gotchas

- **`validation_mode='permissive'` enforces NOTHING.** It is a pure passthrough so the 118
  pre-existing datasets keep their exact prior write behavior. Enforcement is opt-in via
  `'strict'`. Do not "helpfully" make permissive enforce things — that silently breaks live data.
- **Required-field grandfathering (strict).** A required field only raises on INSERT, or on
  UPDATE that *drops a previously-set value*. Rows that were *already* missing a required field
  (26 such rows existed at P1) stay editable on their other fields. This is intentional.
- **Realtime fanout.** `udt_dataset_rows` is in the `supabase_realtime` publication — a 10k-row
  import emits 10k events. Importers MUST batch via `udt_bulk_write`, and only the UI viewing a
  given dataset should subscribe. Do not subscribe app-wide.
- **Version table growth.** Every cell edit appends to `udt_dataset_row_versions`. No retention
  policy yet (P2). Heavy agent traffic will grow it quickly — budget for archival.
- **`udt_change_field_type` validates against the *pre-change* type** during the row rewrite
  (rows are rewritten before the field's `data_type` flips). Run type changes on permissive
  datasets; on strict datasets with un-castable required values it can conflict. Documented
  limitation, not a bug.
- **New RPCs are NOT in the anonymous API surface.** They are granted to `authenticated` +
  `service_role` only and additionally guard `auth.uid()`. The *older* `udt` RPCs are still
  anon-executable (pre-existing convention) — don't copy that when adding new ones.
- **Three `create_new_user_table*` variants exist.** Pre-existing tech debt; do not add a fourth.

---

## Related features

- Depends on: `features/sharing` (permissions / `shareable_resource_registry` / `has_permission`),
  `features/files` (import source files, P3/P4), `features/scopes` (org/project/task scoping columns)
- Depended on by: `features/resource-manager` (TablesResourcePicker), `features/organizations`
- Cross-links: `features/sharing/FEATURE.md`, `features/files/handler/FEATURE.md`

---

## Doctrine compliance

**Primitives reused**
- Types: Supabase-generated `udt_*` Row/Insert/Update types (`types/database.types.ts`);
  `field_data_type` enum.
- Sharing: `shareable_resource_registry` + `has_permission(table, id, level)` + `permission_level`
  enum — reused as-is for `udt_workbooks` (one INSERT row, no new sharing machinery).
- Components / hooks: existing `components/user-generated-table-data/*`, `utils/user-table-utls/*`,
  `utils/user-tables-rpc.ts` — extended, not replaced.

**Primitives introduced**
- `udt_workbooks` table — Why new: there is no existing primitive that groups N datasets under one
  imported source with its own sharing identity. Considered extending: a JSON column on
  `udt_datasets`. Rejected: workbooks need their own RLS, sharing registry entry, and 1→N FK.
- `udt_dataset_row_versions` table + `udt_log_row_version` trigger — Why new: no row-history
  primitive existed for `udt_*`. Considered: a generic audit log. Rejected: that log is
  super-admin-scoped (`admin_audit_log`); this is user-facing per-dataset history with viewer RLS.
- `udt_upsert_row` / `udt_upsert_cell` / `udt_bulk_write` / `udt_change_field_type` RPCs — Why new:
  existing RPCs (`add_data_row_to_user_table`, `append_rows_to_user_table`,
  `batch_update_rows_in_user_table`) cover append/batch but not row_id-or-null upsert, surgical
  single-cell write, mixed-op transactions, or type migration with JSONB rewrite — the exact verbs
  agents need. Considered extending the existing RPCs: rejected to avoid changing signatures the
  current UI depends on; the new RPCs are the agent-facing layer alongside them.
- `udt_validate_row` + validation trigger — Why new: `is_required` / `data_type` were declared but
  never enforced at the DB. No existing enforcement primitive to extend.

> Five new primitives is above the "re-read PRINCIPLES" line, but each is a distinct platform
> capability (grouping, history, agent-write verbs, validation) that the spreadsheet initiative
> consumes across all later phases — not artifact-only code.

---

## Known tech debt (audited 2026-05-29)

**Dead RPCs — zero call sites in the repo.** Safe to drop after a final external-consumer audit
(matrx-extend, aidream backend) — surfaced here so the user can decide:
- `append_rows_to_user_table` — superseded by `udt_bulk_write` with `op:'insert'`
- `batch_update_rows_in_user_table` — superseded by `udt_bulk_write` with `op:'update'`
- `remove_column_from_user_table` — no live UI consumer; column delete goes through the
  table-config RPC
- `create_new_user_table` — duplicate of `_dynamic` variant (active)
- `create_new_user_table_wrapper` — duplicate of `_dynamic` variant (active)
- `create_user_table_with_fields` — duplicate of `_dynamic` variant (active)

**Untyped RPC params at 21 call sites** across `components/user-generated-table-data/**`,
`app/(core)/data/**`, and `utils/user-table-utls/**`. P2 migrates these to typed service helpers
(start with the new `features/data-tables/service.ts`).

**Code scattered across 3 directories** instead of one. P5 consolidates under
`features/data-tables/`.

---

## Current work / migration state

Multi-phase "spreadsheet UX" initiative on branch `claude/spreadsheet-ux-solutions-fqRqP`.

- **P1 (done, live):** data-layer backbone — this migration (`migrations/udt_v2_backbone.sql`,
  applied as `udt_v2_backbone` + `udt_v2_backbone_hardening`). Workbooks table, version history,
  validation, agent write RPCs, type-change RPC, realtime, sharing registry, `workbook_id` hook.
- **P2 (next):** consume P1 from the frontend — migrate call sites to the typed service layer,
  surface version history in the UI, add a strict-mode toggle, schedule a version-table
  retention policy. See "P2 call-site migration plan" below.
- **P3:** smart importer — route uploaded files to typed dataset vs workbook; uses
  `utils/user-table-utls/type-inference.ts`.
- **P4:** workbook surface — full-collab from day one; Univer snapshot storage; `/workbooks/{id}`
  route; wire `udt_workbooks.original_file_id` FK to `features/files`.
- **P5:** consolidate scattered code under `features/data-tables/`.

---

## P2 call-site migration plan

Concrete, ordered migration of the 21 active RPC call sites (audited 2026-05-29) onto the new
typed service layer (`features/data-tables/service.ts`). Order is "safest → riskiest" — each
wave should ship and bake before the next.

**Wave A — read paths (no behavior change, only types).** These don't go through the new RPCs
at all; they just need typed wrappers around the existing reads. Lowest possible risk.
- `components/user-generated-table-data/UserTableViewer.tsx:278,312,362,725` and the 5 other
  `get_user_tables` / `get_user_table_complete` / `get_user_table_data_paginated_v2` sites →
  add `getUserTables()`, `getUserTableComplete(tableId)`, `getUserTableData({ tableId, ... })`
  to `service.ts` (thin typed wrappers; the body is the same `.rpc()` call). Migrate the 18
  read call sites one at a time. Verify each: page renders unchanged, no console errors.

**Wave B — single-row writes through `udt_upsert_row` / `udt_upsert_cell`.** These already
work today; the only behavior change is that mutations now go through validation +
version-logging triggers.
- ✅ `components/user-generated-table-data/EditRowModal.tsx` — migrated to `upsertRow({ tableId, rowId, data })`.
- ✅ `components/user-generated-table-data/UserTableViewer.tsx` per-field HTML cleanup — migrated to `upsertCell` (surgical jsonb_set so it cannot drop other fields).
- ✅ `components/user-generated-table-data/UserTableViewer.tsx` expanded-text save — migrated to `upsertCell`.
- ⏳ `components/user-generated-table-data/UserTableViewer.tsx` bulk HTML-cleanup batch loop — **deferred**. Each batch entry is a partial-row update with multiple changed fields per row; migrating cleanly requires a new `op:'merge'` (jsonb_concat) in `udt_bulk_write`. Tracked in tech debt below.

**Wave C — surgical cell writes through `udt_upsert_cell`.** Pure win — avoids serializing the
full row payload. No existing call site does this today (the old RPCs are row-shaped); this is
where the new shape opens performance / network savings.
- Future inline-cell-edit refactor of `UserTableViewer` (currently sends whole row even for a
  one-field change). Migrate when the cell-edit UX work happens.
- Agent-tool writes (new code, no existing call site).

**Wave D — bulk import through `udt_bulk_write`.** The big-bang performance win.
- ✅ `components/user-generated-table-data/ImportTableModal.tsx` — migrated from a sequential
  N-round-trip `for-await addRow` loop to a single `bulkWrite({ tableId, operations })` call.
  Semantic improvement: insert failures now abort the whole import atomically rather than
  silently `console.warn`-ing per-row. In practice, with `validation_mode='permissive'` the
  failure modes are network/constraint only, so the atomic upgrade is correct.

**Wave E — column type changes through `udt_change_field_type`.** New capability — nothing to
migrate, but the column-editor UI should expose the "change type" action and call this RPC
(strategy picker: cast-or-null vs cast-or-skip; show `rows_skipped`/`rows_total` after).
- `components/user-generated-table-data/TableConfigModal.tsx` → add type-change action per field.

**Wave F — surface version history in the UI.** Drop `VersionHistoryViewer` (already built)
into:
- ✅ `UserTableViewer` — added a `History` icon between Pencil and Trash in the per-row action
  group; clicking opens a right-side `Sheet` containing `<VersionHistoryViewer rowId={...} />`.
- ⏳ Future agent-tool inspector surfaces.

**Wave G — strict-mode toggle.**
- ✅ `components/user-generated-table-data/TableSettingsModal.tsx` — "Strict Validation" Switch
  added. Writes `validation_mode` via `supabase.from('udt_datasets').update(...)` (the existing
  RLS UPDATE policy already gates owner-or-editor). Only fires when the value actually changed.
- ⏳ Auto-strict on import (`ImportTableModal`) — **deliberately deferred**. Defaulting newly
  imported tables to strict would surprise users mid-flow; the Settings toggle lets them opt
  in when they're ready.

**Wave H — retention policy for `udt_dataset_row_versions`.** Pick one of:
- A weekly cron (`pg_cron`) that keeps the last N versions per row + everything from the last K
  days. Simplest.
- An archival table (versions older than K days → `udt_dataset_row_versions_archive`).
- A `keep_versions` setting per dataset.
Decide before agent-heavy workloads land.

## Change log

- `2026-06-03` — claude: **P4 v1 — lossless workbook surface shipped**. New `udt_workbook_snapshots`
  table (append-only content store keyed by `udt_workbooks.id`, RLS-mirrored, in
  `supabase_realtime`). Migration `udt_v2_workbook_snapshots` applied live. New
  `features/data-tables/workbook-service.ts` (8 typed wrappers — CRUD on workbooks + snapshots),
  `useWorkbookRealtime` hook (Postgres-Changes subscription), `WorkbookEditor` component
  (Univer-mounted, 2.5s-debounced autosave, hot-swap on remote snapshots from other users with
  self-echo suppression), and routes `/workbooks` (list/create/delete) + `/workbooks/[id]`
  (open/rename/edit). `@univerjs/presets` + `@univerjs/preset-sheets-core` added (dynamic
  import in the route so Univer never runs server-side). V1 is last-write-wins on the snapshot
  row — real CRDT collab is the v2 layer, can build on this store unchanged.
- `2026-06-03` — claude: spreadsheet UX milestone. Three user-visible features landed:
  (a) **Inline cell editing** — new `EditableCell` component wraps every cell display in
  `UserTableViewer`; double-click enters edit mode, input shape adapts to `data_type`
  (text / number / checkbox / date / datetime / textarea), Enter or blur commits via
  `udt_upsert_cell`, Escape cancels, errors surface as toast. (b) **Realtime sync** — new
  `useTableRealtime` hook subscribes to `udt_dataset_rows` changes for the current
  tableId; `UserTableViewer` debounces refetch to 400ms so other users' edits appear
  without thrashing on bulk imports. (c) **Column-type badges** in headers. Also Wave B
  fully complete — bulk HTML-cleanup migrated to `bulkWrite({op:'merge'})` (one atomic
  call, no per-row round-trips). Migration `udt_v2_bulk_write_merge_op` applied live and
  verified via rollback test.
- `2026-05-29` — claude: P2 execution continues. Wave B finished for two of three remaining
  call sites (HTML cleanup per-field + expanded-text save → `upsertCell`); third site (bulk
  HTML cleanup) deferred pending `op:'merge'` addition to `udt_bulk_write`. Wave G done —
  strict-mode Switch in `TableSettingsModal` writes `validation_mode` via direct RLS-gated
  update.
- `2026-05-29` — claude: P2 execution starts. Wave D (`ImportTableModal` → `bulkWrite`), Wave F
  (row-history `Sheet` wired into `UserTableViewer` via a new `History` row-action icon), and
  half of Wave B (`EditRowModal` → `upsertRow`) landed. Also added `isServiceFailure<T>()` type
  guard in `types.ts` to work around a TS 5.9 narrowing quirk with discriminated unions
  returned from async functions.
- `2026-05-29` — claude: P2-prep wave 3. Added `VersionHistoryViewer` component
  (`features/data-tables/components/`) — self-contained row-history reader on top of
  `useRowVersions`. Renders insert/update/delete + per-key diffs, treats `changed_by=NULL`
  as "System" (never falls back to row owner). Drop-in for any surface that wants audit UI.
- `2026-05-29` — claude: P2-prep wave 2 (fixes from independent service-layer review).
  Migration `udt_v2_upsert_row_default_null`: `udt_upsert_row.p_row_id` and `p_data` now
  have `DEFAULT NULL` in the SQL signature so the generated TS types correctly mark
  `p_row_id` as optional (PostgREST emits `p_row_id?: string`). Service layer no longer
  needs the `?? null` workaround. Also: `useRowVersions` hook now catches pre-response
  network throws so it cannot get stuck in `loading: true` (`.then(ok, err)` overload).
- `2026-05-29` — claude: P2-prep wave 1. Typed service layer (`service.ts`) wrapping the 4 new
  RPCs; canonical domain types (`types.ts`); read-only `useRowVersions` hook for history UI.
  Also: hardening v2 migration applied (`udt_v2_backbone_hardening_v2`) addressing 4 issues
  flagged by independent review — `udt_validate_row` marked VOLATILE (was STABLE — memoization
  risk on bulk paths); `udt_change_field_type` now skips rows missing the target field (no
  spurious UPDATEs / realtime fanout) and returns `rows_skipped`/`rows_total`; `udt_bulk_write`
  `cell` op now rejects undeclared fields (matches `udt_upsert_cell`); `udt_log_row_version`
  stores NULL `changed_by` for system writes instead of falsely attributing to row owner
  (`udt_dataset_row_versions.changed_by` made nullable).
- `2026-05-29` — claude: P1 backbone applied live (`udt_v2_backbone` + hardening): `udt_workbooks`,
  `udt_dataset_row_versions`, `validation_mode`, validation + version triggers, `udt_upsert_row` /
  `udt_upsert_cell` / `udt_bulk_write` / `udt_change_field_type` RPCs, realtime publication,
  sharing-registry entry, `workbook_id` hook. Created this FEATURE.md.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to this feature, update this
> file's status, add flows you introduced/removed, and append to the Change log.
