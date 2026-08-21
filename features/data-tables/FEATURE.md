# FEATURE.md — `data-tables` (User Data Tables / `udt_*`)


**Status:** `migrating`
**Tier:** `1`
**Last updated:** `2026-08-18`

---

## Column shape — THE COLUMN KNOWS ITSELF

**Never count distinct values in the browser.** `udt_column_facets` (one column)
and `udt_table_profile` (every column, one round trip) answer "what is actually
in this column" in the database, over every row. The viewer used to pull up to
5,000 rows down to filter client-side and, past that cap, answered confidently
over a partial set.

Three consumers, one answer path: the value-picker column filter, the option
list pre-filled when a `choice` format is declared, and the column profile
panel. Typed wrappers are `getColumnFacets` / `getTableProfile` in `service.ts`.

🚨 **LOCAL DATA FIRST — the RPC is the FALLBACK, not the default.** When the
browser already holds every row the facets describe, they are computed in
memory (`computeColumnFacets`, `column-filters.ts`): instant, offline-safe, no
spinner, no request. Most user tables fit on one page, so most columns never
touch the network at all. Ask the server ONLY when `localRows` does not cover
`totalCount` (`localFacetsAreComplete`) — counts from a partial set look
authoritative and are wrong. **Never fetch first and ask questions later.**

Both RPCs are **SECURITY INVOKER** — `udt_dataset_rows` RLS is already the right
gate, and a DEFINER read would be a second, weaker authority over the same rows.
Refusals are meaningful: a field name that is not a column RAISES (never an
empty list, which reads as "the column is empty"), and an unreachable dataset
raises P0002 for AccessGate.

The `looks_*` fields on a profile are **counts, not verdicts** — 19 of 20 values
being URLs is a different situation from 20 of 20, and only the caller knows
which one is worth acting on.

## Choice columns

A column can offer an option list without any database enum — see
[`lib/field-formats/FEATURE.md`](../../lib/field-formats/FEATURE.md) § Choice.
The parts that live here: `ChoiceInput` (THE input for a choice column, used by
both row modals and the inline cell editor), and the grid's grid-wide option
resolution in `UserTableViewer` (`useFieldChoiceMap` — one resolution per
column, never one per cell, and a hook per column is impossible because the
column count is data).

**Dependent columns** narrow to the group named by another column's cell. The
grid passes the saved row; a row FORM passes its LIVE draft, so narrowing
follows the user's typing. A controller change never rewrites the dependent
cell — an off-list value goes amber and the user decides.

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
- ✅ Wave E — `TableConfigModal`: changing a field's `data_type` now prompts a destructive-confirm with the old→new summary, then runs `udt_change_field_type({strategy:'cast_or_null'})` per changed column; result toast shows total rows rewritten.
- ✅ Wave F — `UserTableViewer`: row-action `History` icon → Sheet with `VersionHistoryViewer`
- ✅ Wave B (4 of 4) — `EditRowModal` → `upsertRow`; `UserTableViewer` HTML cleanup + expanded-text save → `upsertCell`; bulk HTML-cleanup loop → `bulkWrite({op:'merge'})`
- ✅ Wave G — `TableConfigModal` → Table Settings tab: strict-mode toggle persisting `validation_mode` (moved there 2026-08-14; the modal that originally held it was never mounted — D189)
- ✅ **Inline cell editing** — every `UserTableViewer` cell now wraps in `EditableCell` (double-click → type-aware input → `upsertCell` → success or toast)
- ✅ **Realtime sync** — `UserTableViewer` subscribes to `udt_dataset_rows` changes for its tableId; debounced 400ms refetch
- ✅ **Column-type badges** — every header now shows the `data_type` under the display name
- ✅ **`op:'merge'` in `udt_bulk_write`** — applied live + verified; partial-row patch via `jsonb_concat`
- ✅ **Table-native selection + scoped copy** — every `UserTableViewer` surface has persistent page-spanning row checkboxes, icon-only direct Copy / Copy for AI, selected-row copy, and a large non-blocking WindowPanel workspace for exact row/column projection. The workspace reuses the canonical `MatrxDataTable` search, whole-word matching, per-column filters, layered advanced filters, sorting, pagination, and selection at every table size.
- ✅ **Stable responsive Table Settings + dataset door** — the wide desktop dialog uses the available viewport instead of crushing rows into 800px; deterministic desktop/tablet/phone grids keep every column card the same height; format-specific controls float in a popover; conversion status stays in the fixed footer; the selected border is internal and unclipped; dropdowns add no horizontal scroll or layout shift. The title renders the dataset through `EntityRef` so the named resource always opens.

**P4 workbook surface (lossless spreadsheet, v1):**
- ✅ `udt_workbook_snapshots` table — append-only content store keyed by `workbook_id`; RLS mirrors `udt_workbooks`; viewers see all snapshots they can view the parent of; editors can append; in `supabase_realtime` publication.
- ✅ `workbook-service.ts` — `createWorkbook` / `listAccessibleWorkbooks` / `getWorkbook` / `renameWorkbook` / `deleteWorkbook` / `getLatestSnapshot` / `saveSnapshot` / `listSnapshots`.
- ✅ `useWorkbookRealtime` hook — Postgres-Changes subscription for `udt_workbook_snapshots` filtered by `workbook_id`.
- ✅ `WorkbookEditor` component — mounts Univer (`@univerjs/presets` + `@univerjs/preset-sheets-core`), hydrates from latest snapshot, debounces autosave (2.5s after last edit), hot-swaps on remote snapshots from other users; ignores echo of own writes. Status pill shows idle / dirty / saving / saved / error. Toolbar buttons: "Save now" (labeled snapshot, bypasses autosave) and "History" (opens snapshot timeline).
- ✅ Routes — `/workbooks` (list + create + delete + **import XLSX/CSV**), `/workbooks/[id]` (open + rename + edit). Editor is dynamically imported with `ssr:false` so Univer never runs server-side.
- ✅ **XLSX/CSV import** — `xlsxToUniverWorkbook` (SheetJS-based) converts uploaded files to a minimal `IWorkbookData`: values + types + formula source for all sheets, ISO dates for date cells. Pre-flight parse so a malformed file does not leave an empty workbook husk. The original file id will plug into `udt_workbooks.original_file_id` once the universal file handler linkage is wired.
- ✅ **Snapshot history viewer + restore** — `WorkbookHistoryViewer` lists snapshots newest-first with origin badges (autosave / manual / imported / restored); Restore writes a NEW snapshot from the chosen one so the realtime hook hot-swaps automatically. Snapshots are append-only; restoring does not delete history.
- ✅ **Export workbook → XLSX** — `univerSnapshotToXlsxBuffer` + `downloadUniverAsXlsx` (SheetJS). Symmetric to the import path; same scope (values + types + formula source per sheet). Wired as a toolbar button in `WorkbookEditor`; filename = workbook name.
- ✅ **Share + permission gating** — `udt_workbooks` added to client-side `SHAREABLE_RESOURCE_REGISTRY` (DB registry had it from P1). `/workbooks/[id]` header gets the standard `<ShareButton>`. Page calls `has_permission(udt_workbooks, id, 'editor')` at mount to decide whether the editor mounts in editable or viewer-only mode (owner always edits; shared editors detected via the RPC; everyone else sees viewer mode).
- ✅ **V2 — full CRDT collab is LIVE.** Yjs over Supabase Broadcast via the public `onMutationExecutedForCollab` hook; `collab` flag ON at `/workbooks/[id]`. Verified by `features/data-tables/collab/verify-collab.ts` (10/10, incl. real-Broadcast e2e). See `collab/FEATURE.md` — run the verify gate before touching the provider/session.

**P5 — operational hardening (decided 2026-06-06):**
- ✅ **Wave H retention policy — implemented.** Per-row: keep all versions ≤ 14 days; ALWAYS keep latest 2 regardless of age; delete only if both `recency_rank > 2` AND `older_than_14_days`. Trim function: `udt_dataset_row_versions_trim()` (SECURITY DEFINER, service_role only). pg_cron job `udt_dataset_row_versions_trim_weekly` scheduled `0 3 * * 0` (Sundays 03:00 UTC). Migration `udt_v2_retention_and_original_file_fk` (applied live 2026-06-06).
- ✅ **aidream attribution — honest NULL.** Decided to keep `changed_by = NULL` for service_role / pool writes (no JWT). The audit trail honestly reports "system write" rather than misattributing to row owners. No code change required on aidream's side.
- ✅ **`udt_workbooks.original_file_id` FK live.** `REFERENCES cld_files(id) ON DELETE SET NULL`. Workbook import path now uploads the source file via `fileHandler.upload(...)` first and stores the `cld_files.id` on the workbook row. Upload failure is non-fatal — workbook still imports without the link.
- ✅ **Smart importer (P3) — shipped.** `features/data-tables/smart-importer.ts` detects routing via 7 weighted signals (merged cells / formula density / multi-sheet / column-type uniformity / header-row pattern / sparsity / styling). Dialog (`ImportRouteDialog`) shows the recommendation with reasons; user can override. Auto-route threshold `confidence > 0.6`. "Smart import" button on `/workbooks`; typed-routing hands off to `/data` via a single-shot module slot (`smart-import-pickup.ts`) so `ImportTableModal` can open pre-loaded.

**Workbook collab v2 — ✅ DONE (2026-06-12):**
- ✅ Implemented, verified (`collab/verify-collab.ts` 10/10 incl. real-Broadcast e2e), and flag flipped ON at `/workbooks/[id]`. Architecture + the three bugs the verify gate caught are documented in `collab/FEATURE.md`.
- ⏳ v2.1 polish (optional): pixel-positioned cursor rings over the actual cell (currently a toolbar presence strip); repurpose `useWorkbookRealtime` to log-only.

**Pending — needs UX design (⏳):**
- ⏳ **Wave P3 — smart importer (XLSX → typed dataset vs workbook).** Detects "rational" (header-row + uniform-type columns) vs "look-sensitive" (merged cells, formulas, multi-region) and routes the upload to `udt_datasets` or `udt_workbooks` accordingly. P4 v1 makes this fully unblocked. Today the user picks the destination by entering via `/data` (typed) or `/workbooks` (lossless).

**Pending — small + clear (🚧 ready when you say go):**
- 🚧 **Bulk paste from Excel / Sheets clipboard** into the typed-dataset grid.
- 🚧 **`udt_workbooks.original_file_id` linkage** to the universal file handler — store the uploaded XLSX/CSV blob so the lossless original can be downloaded / re-imported / passed to a "diff against original" view.

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

## Structured Lists vs. Typed Datasets

Structured Lists are reusable, editable collections of item objects. They can be flat, or each item can
carry a `group_name` so the same list can render as grouped sections, dependent dropdown choices,
categorized checklists, shopping lists, task lists, menus, lightweight taxonomies, reusable labels, or
agent/runtime choice sets.

The important naming rule: **Structured List** is the product/data concept; **picklist** is one usage mode.
When a Structured List powers a dropdown or agent variable choice, it behaves like a picklist. That does
not make the underlying list read-only or dropdown-only. Owners/editors can mutate the list and its items.

A Structured List is not a full table. Its item shape is intentionally fixed: `label`, protected
`description`, `help_text`, optional `group_name`, optional `icon_name`, and ownership/visibility metadata.
A UDT typed dataset is the true table model: dynamic columns, typed cells, row validation, row history,
cell-level writes, bulk operations, and richer import/export flows.

Current database names are `workbench.udt_structured_lists` /
`workbench.udt_structured_list_items`. Some UI folders and TypeScript/Python symbols still use
picklist/list vocabulary while the app/server packages move to the Structured List naming.

## Two complementary table storage models

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

**Univer mixed-editor invariant:** `DocumentEditor` stays document-only, but
registers `HoverManagerService` and `DragManagerService` through
`registerUniverFacadeDependencies()` before creating the document. Univer Facade
observers are process-global, while sheet plugins are lazy by unit type; a
document-only injector otherwise receives the sheets observer at `Rendered`
without its dependencies. **Never start `UniverSheetsCorePreset` here** — it
creates workbook UI and duplicate internal editor documents.

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
- `features/udt-picklist/` — Structured List management UI:
  `PicklistLanding.tsx`,
  `PicklistManagerV1/V2/V3.tsx`, `usePicklists.ts`
- `components/mardown-display/tables/SaveTableModal.tsx` — saves a markdown/stream table to a
  dataset. Default path creates a NEW dataset; a collapsed "Save to an existing table instead"
  disclosure offers **Append** / **Replace** to an existing table with column reconciliation,
  opt-in new-column creation, and optional shallow dedupe (skip / update). Consumes
  `reconcile.ts` + `save-to-table.ts`.
- `components/mardown-display/blocks/json/AppendToTableDialog.tsx` — appends a JSON block's rows
  to an existing dataset; same shared engine (atomic `appendToTable`).
- `components/user-generated-table-data/TableIdentityMenu.tsx` — the ONE identity control in the
  `/data/[id]` route header: shows the table name, renames it in place (via
  `update_user_table_metadata`), switches tables, and creates a new one. Replaced the old
  header-title + in-body `Select` pairing that showed the same name twice.
- `components/content-cleanup/CellCleanupButton.tsx` — the shared bulk cell-cleanup control
  (popover of opt-in operations with live counts → review dialog → one atomic merge write).
  Grid-agnostic; owned by [`lib/content-cleanup/`](../../lib/content-cleanup/FEATURE.md), NOT by
  this feature. Wired into `TableToolbar` via its `cleanupControl` slot.
- `features/data-tables/components/VersionHistoryViewer.tsx` — row audit log with restore;
  consumes `useRowVersions` + the typed service layer. Read-only by default; pass
  `tableId` + `editable` to unlock **Restore this version** (whole-row rewrite via
  `upsertRow`), **Restore deleted row** (re-insert of the last snapshot as a new row),
  and per-field **revert** (`upsertCell` back to the prior value) — all confirm-gated
  where destructive, all themselves versioned. Also: relative timestamps (absolute on
  hover), field display-name labels via `fieldLabels`, copy-snapshot-as-JSON, Load more
  past the first 50, `onRowChanged` refetch callback. Honours `changed_by = NULL` as
  "System".
- `features/data-tables/components/TableCopyControls.tsx` + `TableCustomCopyWindow.tsx` + `table-copy.ts` — the shared user-table copy surface, lazily loaded WindowPanel workspace, and pure projection/Markdown/AI-envelope builders. `UserTableViewer` mounts the controls once, so route, quick-data sheet, resource picker, canvas, modal, dataset overlay, and WindowPanel consumers stay identical.

**Services / business logic**
- `utils/user-tables-rpc.ts` — RPC response unwrapping (`unwrapGetUserTableComplete`,
  `unwrapGetUserTables`, `unwrapSuccessEnvelope`, `unwrapGetUserTableDataPaginatedRows`,
  `isPaginatedDataRow`)
- `utils/user-table-utls/table-utils.ts` — `createTable()`, `addRow()`, `addColumn()`,
  `getTableDetails()`, `FieldDefinition`, `TableField`, `VALID_DATA_TYPES`
- `features/data-tables/reconcile.ts` — **pure** column reconciliation + shallow dedupe for
  saving incoming tabular data into an existing table: `reconcileColumns()` (matched /
  incoming-only / table-only), `autoMapColumns()` (3-tier header→field matcher, moved here from
  the JSON `AppendToTableDialog`), `mapRowsToFields()`, `findDuplicates()` (single-identifier
  scan). No Supabase access — trivially testable.
- `features/data-tables/save-to-table.ts` — the **save-to-existing-table engine**:
  `appendToTable()` and `replaceTable()`. Creates opt-in new columns via `addColumn`, scans
  for duplicates (skip / update), and commits in ONE `udt_bulk_write` transaction. Also exports
  `fetchExistingRows()` (capped read for dedupe/replace). Consumed by the markdown
  `SaveTableModal` and the JSON `AppendToTableDialog`.
- `utils/user-table-utls/type-inference.ts` — `inferDataType()`, `analyzeData()` (used by import)
- `utils/user-table-utls/field-name-sanitizer.ts`, `template-utils.ts`, `sample-data.ts`
- `features/resource-manager/resource-picker/TablesResourcePicker.tsx` — pick a dataset as a resource
- `features/resource-manager/resource-picker/{Workbooks,Documents}ResourcePicker.tsx` — attach a workbook/document to a chat (emits `{type:"workbook"|"document"}` resources → `input_workbook`/`input_document` blocks; the agent reads/edits them via the backend content tools)
- `app/api/export/email-table/route.ts` — email-export (Next API; admin/email concern)

**Redux slice(s)**
- **None.** All reads/writes go directly to Supabase (`supabase.from('udt_*')` + `.rpc()`),
  inline in components. (Doctrine note: a slice is *not* warranted yet — there is no shared
  cross-route dataset state. Revisit if realtime collab needs a normalized cache.)

---

## Data model

**Database tables** (Supabase, project `brsgrqvjdzwihsvnfqkf`)
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
- `udt_structured_lists` / `udt_structured_list_items` — Structured Lists: reusable, editable item collections that
  can be consumed as dropdown/picklist choices but are not limited to that use.

**RLS** — root entities use their registered token (`dataset`, `workbook`, `udt_document`) with
`iam.has_access`; physical `udt_*` table names are never permission keys. Dataset children inherit
through the parent dataset. Workbook/document snapshot policies independently enforce the same
parent-token rule for viewer reads and editor appends. Sharing integrates with the
`shareable_resource_registry`.

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

**5. Save incoming table data into an EXISTING dataset (append / replace)**
- Trigger: user clicks Save on a markdown/stream table (or a JSON block) and chooses an existing
  target table instead of creating a new one.
- Path: `reconcileColumns(incomingHeaders, fields)` diffs the columns → `{ matched, incomingOnly,
  tableOnly }`. The UI shows the diff and lets the user (a) opt in to adding `incomingOnly`
  columns and (b) for append, opt in to a shallow dedupe on one matched "identifier" column.
- Commit goes through `appendToTable()` / `replaceTable()` (`save-to-table.ts`):
  1. New columns created first via `add_column_to_user_table` (necessary — `udt_bulk_write`
     `insert` stores `data` wholesale and does NOT auto-create columns from unknown keys).
  2. Append + dedupe → `fetchExistingRows()` + `findDuplicates()`; collisions are skipped or
     turned into `op:'merge'` (partial update) per the user's choice.
  3. Replace → `op:'delete'` for every existing row + `op:'insert'` for every new row.
  4. Everything commits in ONE `udt_bulk_write` transaction.
- Exit: `{ inserted, updated, skipped, failed, columnsAdded }` → success toast with real counts,
  then opens `quickDataWindow` on the target table.

**6. Agent reads/edits WORKBOOK or DOCUMENT content (Univer snapshots, not datasets)**
- Trigger: user attaches a workbook/document (resource picker → `input_workbook`/`input_document`
  block) or names one in chat.
- Path: the **aidream** backend tools `workbook` / `document` (`action: create | read | edit`,
  RLS-enforced, as the user) read the latest `udt_*_snapshots` row, mutate the Univer JSON, and
  write a NEW `origin='agent'` snapshot. The editor's realtime subscription reflects it live.
  `action="create"` makes a brand-new workbook/document (optionally seeded) for the user.
- **Distinct from flow 1:** flow 1 writes `udt_datasets` cells (relational rows via `udt_upsert_cell`).
  This flow writes the *visual* workbook/document a user edits in Univer. They are not auto-synced.
- Contract lives backend-side: [`aidream/services/udt_content/FEATURE.md`].

---

## Invariants & gotchas

- 🚨 **THE METADATA/ROWS SPLIT — never call `get_user_table_complete` for metadata.** That RPC
  returns EVERY row of the dataset with **no LIMIT anywhere**, and derives `row_count` from
  `jsonb_array_length(data)`. Reach for it ONLY when the caller consumes every row (a full-table
  export). To learn a dataset's name, its columns, its saved sort, or how many rows it has, call
  **`getTableMetadata()`** (`service.ts` → `public.get_full_table`): the full `udt_datasets` row,
  the full `udt_dataset_fields` rows in `field_order`, and a real `COUNT(*)` — no row data.
  Two traps it carries, both absorbed by the service wrapper: its key is **`columns`**, not
  `fields`; and it has **no `{success:false}` envelope** — it RAISES, so an error from it means
  the dataset is missing or its name did not match, NEVER that it has no columns. Do not paper a
  thrown error over as an empty state. Measured 2026-08-14 on a 21-row dataset: 9,204 B → 1,891 B,
  and the saving is O(rows) — the constant ~1.5 KB it adds on a 0-row dataset is the price of
  never scaling with the data.
- **Reads go through `service.ts` like writes do.** `getTableMetadata` / `listUserTables` /
  `getTablePage` are the canonical read layer. Before this existed, `get_user_tables` was
  copy-pasted into 8 components and `get_user_table_complete` into 8 more; a ninth hand-rolled
  fetch is a defect, not a shortcut.
- **Cell cleanup is NOT owned here.** Every "the agent wrapped this value in backticks / bold /
  HTML" fix goes through the shared engine at [`lib/content-cleanup/`](../../lib/content-cleanup/FEATURE.md)
  (`cleanValue` / `cleanCells`) and the shared `<CellCleanupButton>`. Both the per-cell fixer and
  the bulk pass in `UserTableViewer` run the SAME operation set, so they can never disagree about
  what "clean" means. A new kind of damage is a new operation in that registry — never a helper
  in this feature. The bulk pass scans **every** row (`loadAllRowsForCleanup`), not the page.
- **`/data/[id]` renders the viewer in `fillHeight` mode.** Three bands — chrome, grid, pagination
  — where only the grid scrolls. Embedded surfaces (windows, sheets, chat artifacts, pickers)
  leave it off and keep the content-sized `70dvh` cap. There is no in-body table selector any
  more: `onTablesChange` hands the list to whatever surface owns the switcher, so the RPC is
  fetched once and the header owns the choice.
- **Selection belongs to the table system, not an export modal.** `UserTableViewer` owns the persistent source-table selection. The custom-copy WindowPanel consumes that selection as one quick scope and uses `MatrxDataTable`'s controlled selection for its live output projection: page select, Shift-range, select all, clear all, or only the rows matching the current search/filter stack.
- **Quick copy means the complete current view, never the loaded page.** Copy and Copy for AI read the full table through `getCompleteTable()` and then apply the active search, column filters, and sort. Copy emits Markdown. Copy for AI uses the canonical XML envelope with table identity, row/column counts, and friendly display-name keys. The direct actions are icon-only with accessible names. Custom copy defaults to every column and row and opens a large, resizable, non-blocking WindowPanel: searchable full-height column sidebar on the left; the canonical table's global/whole-word search, sortable/filterable columns, layered advanced filters, pagination, and row selection on the right; exact output counts and copy action in the footer. Large and small tables use the same capable workspace.
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

## Column lifecycle — add, format, delete

**Delete is `udt_delete_field` and nothing else.** `deleteField()` in `service.ts` is the ONE
path; both entry points (Table Settings' per-column trash button and the column header menu's
"Remove column") use the same confirm copy and the same call, so they cannot diverge. The RPC
purges the column's key from every row — an orphan JSONB key would otherwise resurrect itself
the moment a column of the same name is re-added — closes the `field_order` gap, drops a
`row_ordering_config.default_sort` / `label_field` that pointed at it, and **refuses to remove
the last remaining column**. Cleared values survive in `udt_dataset_row_versions`.

**Display format is a UI layer, never a storage change.** A column declares an optional format
in `udt_dataset_fields.metadata.format = {id, options}` — `currency`, `percent`, `email`,
`url`, `rating`, `duration`, `tags`, … The stored `data_type` and every stored value are
untouched, so a format can be set, changed, or cleared with zero risk and no confirmation.

- Registry, THE FALLBACK LAW, and how to add a format: **[`lib/field-formats/FEATURE.md`](../../lib/field-formats/FEATURE.md)**.
- Write with `setFieldFormat()` (→ `udt_set_field_format`); read with
  `resolveFieldFormat(field.data_type, field.metadata)`. **Never read `metadata.format` by hand.**
- A column with no declared format renders down `UserTableViewer`'s original code path, so
  every pre-existing table is byte-identically unchanged.
- A value that does not fit its format renders as the STORED value in amber with a tooltip —
  never blank, never an error.

**Row labels in Reorder Rows** come from `row_ordering_config.label_field` (a real column, the
RPC rejects names that do not exist), falling back to the first text column by `field_order`.
Never derive a label from `Object.keys(row.data)`: Postgres does not preserve jsonb key order,
so that picks an arbitrary column and can pick a *different* one per row.

🚨 **`has_permission` takes the entity token `dataset`, NOT the table name `udt_datasets`.**
A bare table name does not return false — `has_permission_for` RAISES P0001. Owners are not
safe either: Postgres does not guarantee left-to-right OR short-circuiting inside an RLS
policy, so `user_id = auth.uid() OR has_permission('udt_datasets', …)` still blows up. This
shipped broken in 6 RPCs and 9 policies until 2026-08-14 and rendered a hard error on
`/data/[id]`. Check the token against `platform.entity_types` before writing a guard.

---

## Known tech debt (audited 2026-05-29)

**Dead RPCs — zero call sites in the repo.** Safe to drop after a final external-consumer audit
(matrx-extend, aidream backend) — surfaced here so the user can decide:
- `append_rows_to_user_table` — superseded by `udt_bulk_write` with `op:'insert'`
- `batch_update_rows_in_user_table` — superseded by `udt_bulk_write` with `op:'update'`
- ~~`remove_column_from_user_table`~~ — **this entry was wrong and cost the product a
  feature.** It claimed "column delete goes through the table-config RPC"; it does not.
  `update_user_table_config` has no delete verb, so once this RPC was dropped a user could
  add columns forever and never remove one. Replaced 2026-08-14 by `udt_delete_field`
  (see Column lifecycle below). Read this as the standing warning: before calling an RPC
  dead, name the surface that replaces it.
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

**Wave A — read paths.** ✅ **Landed 2026-08-14** as `getTableMetadata` / `listUserTables` /
`getTablePage` in `service.ts` — and it turned out to be more than typing. Every metadata-only
caller was on `get_user_table_complete`, which ships the entire dataset, so the wrappers moved
them to `public.get_full_table` (schema + `COUNT(*)`, no rows). See THE METADATA/ROWS SPLIT
under Invariants. Converted: `UserTableViewer` (the primary surface — was materializing the whole
dataset, then making a second round-trip for the page it renders), `TablesResourcePicker`,
`TableSettingsModal` (which also fixes a latent bug: `get_user_table_complete` never returned
`validation_mode`, so the Strict Validation switch read "permissive" for every dataset),
`app/(public)/free/zip-code-heatmap/.../TableDataSource`, `utils/user-table-utls/table-utils`'s
`getTableDetails` (feeds `AppendToTableDialog`, `SaveTableModal`, `AddRowModal`),
`ExportTableModal`'s hand-rolled `udt_dataset_fields` query, and `matrx-envelope`'s
`table_schema` resolver (two parallel queries → one call).
- ⏳ Remaining: the other `get_user_tables` copies (`TableCards`, `QuickDataSheet`,
  `AppendToTableDialog`, `SaveTableModal`) and the other `get_user_table_data_paginated_v2`
  copies should adopt `listUserTables` / `getTablePage` as those files are next touched.
- **Deliberately left on `get_user_table_complete`:** `ExportTableModal`'s full-table export and
  `app/api/export/email-table/route.ts` — both genuinely consume every row.

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
- ✅ `components/user-generated-table-data/TableConfigModal.tsx` → **Table Settings** tab —
  "Strict Validation" Switch. Writes `validation_mode` through `setValidationMode()` in
  `service.ts` (a direct RLS UPDATE on `workbench.udt_datasets`; the existing policy already
  gates owner-or-editor, and the wrapper's `.select()` turns an RLS refusal — a silent zero-row
  UPDATE — into a real error instead of a false "Saved"). Only fires when the value changed.
  It lived in a `TableSettingsModal` nothing ever mounted until 2026-08-14 (D189).
- ⏳ Auto-strict on import (`ImportTableModal`) — **deliberately deferred**. Defaulting newly
  imported tables to strict would surprise users mid-flow; the Settings toggle lets them opt
  in when they're ready.

**Wave H — retention policy for `udt_dataset_row_versions`.** Pick one of:
- A weekly cron (`pg_cron`) that keeps the last N versions per row + everything from the last K
  days. Simplest.
- An archival table (versions older than K days → `udt_dataset_row_versions_archive`).
- A `keep_versions` setting per dataset.
Decide before agent-heavy workloads land.

## The grid interaction model — three states, and THE CLICK LAW

`features/data-tables/grid-selection.ts` is the source of truth; read it before
touching how a cell responds to a click or a key.

A grid has **three** states, not two: nothing selected / one cell **selected** /
one cell **editing**. The middle one is load-bearing — arrow keys, Tab, copy,
Delete and fill-down are all meaningless without a current cell, which is why
none of them existed while the grid only had "idle" and "editing".

🚨 **THE CLICK LAW.** A single click may **select** a cell, **toggle** a
two-state value, or **open** a chooser. It may **never** drop the user into a
free-text buffer. Opening a menu is not a mutation and a checkbox is instantly
reversible, but landing in a text buffer turns every attempt to select-and-copy
into an accidental edit. `directClickKinds()` is the entire allowed list
(`checkbox`, `rating`, `select`, `multiselect`); adding a free-text editor to it
is a defect, and a test asserts every free-text kind is refused.

**Addresses are `(rowId, fieldName)`, never indices.** The grid reloads after
every write and realtime reorders rows underneath the user; an index-based
selection silently points at a DIFFERENT row and the next keystroke edits the
wrong one.

**Selection state is owned by the grid, not the cell** (`useGridSelection`).
A cell that owned its own edit flag could never hand off to its neighbour, so
Enter-moves-down and Tab-moves-right would be impossible.

**Hooks live ABOVE the viewer's early returns.** `UserTableViewer` returns early
for loading / error / no-table; a hook added below them changes the hook count
between renders and drops the whole viewer into its error boundary.

🚨 **Easier editing ships WITH undo, never before it.** A click that toggles, a
keystroke that edits, and a Delete that empties are good affordances only over a
recoverable floor. `useCellUndo` captures the inverse **before** the write —
re-reading the cell afterwards races with realtime and with agent writes and can
"undo" to a value someone else just set — and applies it through the same
`upsertCell` path as a hand edit, so it validates, versions, and is refused on a
read-only table. A second write path is always the one that corrupts something.

## 🚨 Which database — before you apply ANY migration here

The live DB is **`brsgrqvjdzwihsvnfqkf`** ("AI Matrx"), served at
`https://db.matrxserver.com`. Pass that `project_id` to every Supabase MCP call.

`txzxabzwovsujtloxrus` is the **RETIRED** old Matrx Main. It is still healthy,
still accepts DDL, and holds a **stale copy of real data** — same table ids,
same row ids. A migration applied there succeeds, and reading it back confirms
exactly what you hoped, while the app never sees the change. This cost a
round-trip on 2026-08-21: `get_user_tables` was "verified" returning
`visibility` while every card in the UI still said "Sharing unknown".

**A DB read that agrees with you is not proof you wrote to the right database.**
When it matters, check what the app actually talks to — intercept `fetch` in the
browser and read the `/rest/v1/` origin.

## Change log

- 2026-08-18 — **Document editor satisfies global sheets Facade dependencies without starting sheets UI.**
  Univer's sheets Facade observer attaches to every later FUniver instance, but
  sheet-typed plugins do not run for a document unit. `DocumentEditor` now
  registers only `HoverManagerService` and `DragManagerService` before document
  creation. Starting the full sheets preset is forbidden here: verification
  proved it replaces the document with a sheet surface and creates a duplicate
  `__INTERNAL_EDITOR__DOCS_NORMAL` unit. Focused contracts guard both halves.

- 2026-08-18 — codex: **Document and workbook snapshot RLS now uses canonical parent tokens.**
  The four legacy snapshot policies still called `has_permission` with physical table names after
  the parent entities were canonicalized, so Postgres raised P0001 while loading a document even
  for its owner. The policies now use `udt_document` / `workbook`, canonical owner/visibility
  columns, and `iam.has_access`; the applied migration asserts that no live RLS policy retains a
  bare `udt_*` permission key.

- 2026-08-17 — codex: **Table Settings rebuilt around zero-shift row geometry.** Removed the 800px desktop cap, oversized conditional warning, horizontal list scroll, flex wrapping, expanding inline format-option rails, and clipped outer selection ring. The dialog now uses a max-6xl edge-efficient frame; one explicit responsive grid aligns name/storage/format/flags/status/delete; every card reserves the same border and status geometry; format options use the shared picker's new popover presentation; conversion state occupies the footer's existing status slot. Browser stress tests at 1440×1000, 1024×768, 768×768, and 375×812 held dialog width/height, list scroll size/position, and every card rectangle unchanged while storage/format dropdowns opened and changed, the format popover opened, and its nested percentage dropdown opened.

- 2026-08-16 — codex: **Table Settings is phone-safe and its dataset identity is a door.** The column editor uses a responsive two-column grid, tap-sized controls, and the shared `FieldFormatPicker` embedded layout so conditional format options take a full-width rail instead of squeezing the row sideways. The title now renders the named dataset through `EntityRef` with open/peek actions. Focused picker tests preserve both embedded and default stacked contracts.

- 2026-08-15 — codex: **Custom copy rebuilt as a real table workspace.** Removed the blocking two-column dialog and its large-table row-selection restriction. Custom Copy and Copy for AI now open a viewport-sized, resizable WindowPanel with a searchable, non-clipping column sidebar and the canonical `MatrxDataTable` interaction stack: contains/whole-word search, per-column filters, layered advanced filters, sorting, pagination, page/Shift selection, only-filtered selection, source-table selection, Select all, and Clear all. Every row and column starts included. Direct toolbar actions are icon-only with accessible names; the shared AI-copy mark is now copy sheets plus a connected intelligence node, with no bot/star/sparkle.

- 2026-08-15 — codex: **Table-native selection and direct, scoped copy shipped across every `UserTableViewer` consumer.** Added persistent checkbox selection (page select-all, Shift-range, clear-all), visible selection count, direct Markdown Copy and XML-wrapped Copy for AI, selected-row variants, and a custom picker for columns plus rows. Small tables (≤20) show individual rows in the picker; large tables reuse the grid selection. The complete sorted/filtered view comes from the typed `getCompleteTable()` service read, so copy never silently truncates to the loaded page. Pure shaping lives in `table-copy.ts` with focused tests. The shared `MatrxDataTable` bulk bar also gains Copy / JSON / Copy for AI automatically whenever a selected table has a `copy` config.

- 2026-08-14 — claude: **ONE table-settings modal, and Strict Validation is reachable at last
  (D189).** `TableSettingsModal` was the only surface carrying the strict-mode toggle and
  **nothing mounted it** — the gear icon in `TableToolbar` has always opened `TableConfigModal`,
  whose Table Settings tab had no `validation_mode` control. So the strict-mode enforcement
  shipped in `udt_v2_backbone` could only be armed by raw SQL or an agent write; no user could
  turn it on. `TableConfigModal` wins the merge (it is the reachable one, and its callsite
  already feeds it the full `udt_datasets` row from `getTableMetadata`, so the current read path
  — the one that fixed the switch reading "permissive" for every dataset — comes along for
  free). The duplicate file is DELETED and the `showTableSettingsModal` props that opened
  `TableConfigModal` are renamed to match what they open. New `setValidationMode()` in
  `service.ts` owns the write. **The "Authenticated Access" switch was deliberately NOT ported:
  `udt_datasets` has no `authenticated_read` column and `update_user_table_metadata` ignores
  `p_authenticated_read`, so that control could never save anything — porting it forward would
  have shipped a lie.** Two layout defects fixed on the way: the Table Settings tab had no
  scroll area of its own (the parent `overflow-hidden` clipped its tail with no scrollbar,
  which is how the new section first arrived unreachable), and the dialog's min-content width
  exceeded a phone viewport, dragging Save off-screen for every control in it. Verified live:
  toggled on → reload → switch reads the stored value; a paste of `not-a-number` into a
  `number` column was refused by the DB with `udt_validate_row: field score value is not
  numeric`; toggled back off → persisted. Light, dark, and 375px. Re-verified 2026-08-15 on
  `/data/11111111-…0001`, adding the required-field half: with a field marked Req and strict
  armed, an insert omitting it is refused with `udt_validate_row: required field category
  missing on insert` — the refusal comes from the DB, not from `AddRowModal`'s own client-side
  required check (proven by calling `udt_upsert_row` directly, bypassing the form).

- 2026-08-14 — claude: **Columns can finally be deleted; reorder-row labels fixed; display
  formats added.** (1) `udt_delete_field` — there had been NO delete-column path since
  `remove_column_from_user_table` was dropped; reachable from Table Settings and the column
  header menu. (2) Reorder Rows chose its label column per row from jsonb key order, so it
  looked random and could differ between rows — now resolved once from the schema, with a
  "Label rows by" picker persisted in `row_ordering_config.label_field`. (3) New platform
  primitive `lib/field-formats/` (22 formats over unchanged storage types, `metadata.format`,
  THE FALLBACK LAW) wired into the grid, inline edit, both row modals, and column creation.
  Also fixed, all found while verifying: **6 RPCs and 9 RLS policies guarded on the invalid
  entity token `udt_datasets`** (rendered a hard error on `/data/[id]`; correct token is
  `dataset`); `get_user_table_complete` omitted `is_public` and `metadata` from its field
  payload, so Table Settings' "Pub" checkbox always read false and a save silently cleared it;
  `update_user_table_row_ordering` rebuilt its config from scratch, discarding `default_sort`,
  and was owner-only so an editor's reorder was silently refused; `addColumn` always returned
  `columnId: undefined` (read `column_id`, RPC returns `field_id`); AddColumnModal kept stale
  state between opens.
- 2026-08-14 — claude: **Wave A read layer landed; every metadata-only caller moved off the
  no-LIMIT full-dataset RPC.** Added `getTableMetadata` / `listUserTables` / `getTablePage` to
  `service.ts` (+ the shared `parseTableMetadata` in `types.ts`, so `table-utils` can share the
  parser without importing the browser client) and converted 7 callsites onto
  `public.get_full_table`. Fixes a latent bug in `TableSettingsModal` — `validation_mode` was
  never in the old payload, so Strict Validation always displayed as off. Deleted three
  superseded files with zero importers, all replaced by live equivalents:
  `features/agents/resources/data-fetcher.ts` (its five table-reference fetches are the
  `matrx-envelope` resolver registry's job now), `TableReferenceIcon.tsx` and its only child
  `TableSelectionModal.tsx` (superseded by `TableReferenceOverlay`, which `TableToolbar` mounts).
- 2026-08-12 — claude: **A THIRD agent was dispatched to make this surface
  agent-writable; again no code changed, and the narrow write posture was
  re-examined and UPHELD.** Recorded because the reasoning is the kind a future
  maintainer will want when they wonder why `cell_value` writes exactly one
  cell. Before discovering the collision, this task had built and fully
  live-verified a competing four-target design — a per-cell target, a
  merge-semantics whole-row target, a bulk one-column-many-rows target, and a
  row-append target, each routed through `upsertCell` / `bulkWrite` with
  pre-flight row-and-column existence checks. It works; it was still discarded,
  because `writeTargets` in `features/surfaces/manifests/data-tables.manifest.ts`
  argues in writing that bulk cell writes are the wrong shape here (a user
  cannot review an N-row diff inside one confirm dialog, so an agent changing
  ten cells should raise ten dialogs — "slower on purpose"). Shipping the bulk
  targets would have overturned a documented decision rather than filling a gap.
  If bulk table writes are ever wanted, that is a deliberate product call about
  reviewability — not a missing feature to be added by the next passing agent.

- 2026-08-12 — claude: **The `/data/[id]` agent-write path was independently
  re-verified by a second agent; no code changed.** A later chip landed on this
  surface after the entry below had already shipped it, so per the surfaces
  collision rule nothing competing was written. It instead re-ran the full live
  verification from scratch against its OWN throwaway table (not the fixture the
  `agent.review_queue` row points at, which was left untouched with its
  description still unset). All six checks held, and the two that matter most for
  this feature were re-confirmed with SQL rather than the agent's summary:
  `updateTableMetadata` wrote ONLY `description` and left `table_name` intact on
  a second table (the RPC's `COALESCE` contract), and `upsertCell` moved exactly
  one row 1→2 with every other field byte-identical while the untouched rows kept
  their original `version` and `updated_at`. The handler's coercion refusal for a
  non-numeric value into a `number` column reached the agent verbatim with
  nothing written. Detail, plus refreshed campaign scouting, lives in the
  `features/surfaces/FEATURE.md` Change Log entry for the same date.

- 2026-08-11 — claude: **`matrx-user/data-tables` (`/data/[id]`) got its FIRST
  surface emitter and 2 ask-policy entity write targets.** This is the third
  surface backed by this feature, and it is distinct from `matrx-user/workbooks`
  (`/workbooks`) and `matrx-user/documents` (`/documents/[id]`) — different
  routes, different page components, no shared target names. The manifest had
  declared 14 values with `readiness: "stub"` and had NO runtime at all, so the
  emitter came first: `agent-context/buildDataTablesScope.ts`, with the provider
  mounted by `UserTableViewer` behind a new opt-in `emitSurfaceScope` prop that
  only `DataTableDetailClient` passes. **That gate is load-bearing** — the viewer
  is also rendered inside `DatasetOverlay`, `ViewTableModal` and
  `UserTableWindow`, which belong to other surfaces, and the surface registry
  resolves deepest-first while `listLiveWriteTargets()` walks the whole stack, so
  an unconditional provider would hijack the host page. `selected_range` was
  deleted from the manifest (this grid has no multi-cell selection concept, so
  nothing could ever emit it) and `is_read_only` added, because both handlers
  gate on it. The targets: `table_description`, and `cell_value` which writes ONE
  cell from an explicit `{row_id, field_name, value}` object. Two service changes
  support them — `updateTableMetadata()` was added to `service.ts` as a typed
  wrapper over the pre-existing `update_user_table_metadata` RPC (whose
  all-`COALESCE` contract is what lets a description-only write leave the table's
  name alone), and **`EditTableModal` + `TableSettingsModal` were migrated onto
  it**, retiring two raw `supabase.rpc` call sites so table metadata has exactly
  one path (a slice of the P2 plan above). `EditableCell`'s private `normalize`
  was exported as `normalizeCellValue` so the cell handler coerces identically to
  the user's own inline typing — though the handler REFUSES what that helper
  forgives (NaN, unparseable JSON), since someone mid-keystroke and an agent
  submitting a final value deserve different strictness. `cell_value` also
  refuses any row not on the page currently on screen, which is the blast-radius
  guarantee: the cell an agent writes is one the user watches change.
  Live-verified end to end on a throwaway table; SQL confirmed a single-cell
  write left every other field byte-identical and the untouched rows at version
  1. Full rationale and the declined fields in `features/surfaces/FEATURE.md`.
- 2026-08-12 — claude: **The document rename FIELD now enforces the same bound
  the write target does (`maxLength={DOCUMENT_NAME_MAX_LENGTH}`).** Additive
  follow-on to the bounds module below, closing the third leg of its own
  contract: the constant was already enforced in the handler and interpolated
  into the manifest prose, but the human's control applied no limit at all.
  Reproduced on `/documents/[id]` before the fix: pasting a 300-character title
  into the header and tabbing away sent it straight to Postgres, came back a
  **400** against `varchar(255)`, and — because `commitRename` deliberately
  swallows service failures so a blur cannot throw — the title silently
  reverted with nothing on screen to say why. With `maxLength` the field clamps
  at 255, the commit succeeds, and the value survives a reload. Verified live
  both ways (before: silent revert; after: clamped and persisted). The agent
  path was already correct — this only closes the human one.
- 2026-08-11 — claude: **Document write-target bounds moved into a pure module;
  the name limit was wrong (200 → 255).** New
  `agent-context/documentWriteValidation.ts` owns `DOCUMENT_NAME_MAX_LENGTH`
  (255 — the REAL `varchar(255)` on `udt_documents.document_name`, verified
  against `information_schema`) and `DOCUMENT_DESCRIPTION_MAX_LENGTH` (2000,
  matching the workbooks sibling). The page handlers call its validators and
  the surface manifest interpolates the same constants into the prose the model
  reads, so the advertised contract and the enforced rule cannot drift. Before
  this, 200 was hand-typed in the handler AND again in the manifest text, and
  the surface refused titles the column accepts. Validation also moved out of
  the async handler bodies so a bad shape throws synchronously, ahead of any
  state change, and `canEdit` joined `docRef` behind a ref because the
  permission gate was still reading a render closure the writeback seam
  resolves early. Live re-verified after the change (see
  `features/surfaces/FEATURE.md`).
- 2026-08-11 — claude: **Documents surface is agent-writable (2 ask-policy write
  targets on the `/documents/[id]` route only).** `document_name` and
  `document_description` — the two human-authored columns on `udt_documents` —
  persist immediately through `document-service`: the existing `renameDocument`
  plus a new `updateDocumentDescription` sibling, so neither handler hand-rolls
  a `.from("udt_documents")` write. Adding that setter keeps this file's
  standing contract with `workbook-service`, whose `updateWorkbookDescription`
  landed the same way one day earlier; the two services stay field-for-field
  symmetric. `commitRename` was refactored into one `applyRename(name)` shared
  by the header field's blur/Enter commit and the write handler, so an agent
  rename takes exactly the user's path — the blur caller still swallows,
  the agent caller throws into an error envelope. Handlers read the row through
  a ref advanced synchronously as each write lands, because the writeback seam
  resolves every handler before the first confirm resolves. `mode: "entity"`
  because this route has no Save bar. The `/documents` library route registers
  no handlers on purpose (no addressable subject on a roster). Deliberately not
  writable: `version` (concurrency counter), owner/org ids, `source` /
  `original_file_id` (provenance), timestamps, `is_public`, and the Univer-owned
  document body. Live-verified with a real agent run; manifest docblock in
  `features/surfaces/manifests/documents.manifest.ts` carries the full
  ruled-out reasoning.
- 2026-08-10 — claude: **Workbooks surface is agent-writable (3 ask-policy write
  targets on the `/workbooks/[id]` route only).** `workbook_name` and
  `workbook_description` persist immediately through `workbook-service` — the
  existing `renameWorkbook` plus a new `updateWorkbookDescription` sibling, so
  neither handler writes `udt_workbooks` directly. `commitRename` on the editor
  page was refactored into one `applyRename(name)` that the header field's
  blur/Enter commit AND the write handler both call, so an agent rename takes the
  identical path to the user typing one. `workbook_sheet_names` is registered by
  `WorkbookEditor` itself (`useSurfaceWriteHandlers`) because the sheets live in
  the Univer instance: it renames via `FWorksheet.setName()`, the SAME Univer
  command a user's sheet-tab rename fires, so it rides the existing
  `onCommandExecuted` → `isSnapshotMutation` → dirty → 2.5s autosave and is
  reversed by Univer's Undo — no new snapshot write path exists or was needed.
  Its value is a partial `{sheetId: newName}` map validated in full (real ids,
  1-31 chars, no `: \ / ? * [ ]`, uniqueness checked against the post-apply
  result) before the first `setName`, so an invalid entry renames nothing.
  `/workbooks` (the library) registers no handlers on purpose — a roster of N
  workbooks has no addressable subject for a single-value write.
  `workbook_snapshot` stays deliberately unwritable: bulk-overwriting a user's
  cells is destructive, not authoring. Live-verified with real agent runs (see
  `features/surfaces/FEATURE.md`).
- 2026-08-09 — claude: **`/documents` hub view toggle moved onto `useListViewPrefs`**
  (`surfaceKey` `documents-hub`). The page's local `HubViewMode` union, the
  `documents-hub-view` localStorage key, and its `useState`/`useEffect` pair are
  deleted; the page narrows `prefs.view` to cards/table for `DocumentsHubToolbar`
  (which keeps its own presentation union). Default is unchanged (cards), and the
  choice now syncs across devices via `userPreferences`.
- 2026-08-08 — **Row history is interactive.** `VersionHistoryViewer` gained restore
  (whole-row rewrite to a snapshot; deleted rows re-insert as a new row), per-field
  revert, copy-snapshot-JSON, relative timestamps, display-name field labels, and
  Load more — all through the existing `upsertRow`/`upsertCell` service layer so every
  restore is itself versioned. `UserTableViewer` passes `tableId`/`editable`/
  `fieldLabels`/`onRowChanged`, and the History row action now renders for READ-ONLY
  viewers of shared tables too (history is a read; write actions stay gated).
  Shared **editors** were locked out of editing entirely (the gate was owner-only);
  it now mirrors `/workbooks/[id]` — `has_permission('dataset', id, 'editor')`, keyed
  by `tableId` so a grant never bleeds across datasets. `useRowVersions` clears its
  list when `rowId` changes so a restore can never act on the previous row's snapshot.
  2026-08-15: restoring a DELETED row now re-points the panel at the new row via
  `onRowReplaced` (it used to keep showing a dead rowId). Open follow-ups are chips
  **TASK-RH-1** (actor chips are bare UUIDs — needs the shared user-identity resolver
  + a `user` door) and **TASK-RH-2** (compare any two versions) in `.matrx/AGENT_TASKS.md`.

- 2026-08-08 — `univer-snapshot-rows.ts` added: `univerSnapshotToRows(snapshot)`
  reads a workbook snapshot back out as a plain string grid — the missing
  half of the round trip (`pushTableToWorkbook` pushes rows IN). First
  consumer: Search Console keyword-classification "Import from workbook".
  Reuse it — never fork a per-feature snapshot walker.

- 2026-07-28 — D97 fixed: DocumentEditor/WorkbookEditor autosave gated by isSnapshotMutation (CommandType.MUTATION + denylist); scrolling no longer writes snapshots.

- `2026-07-24` — **`/data/[id]` layout + cell cleanup.** Three changes.
  (1) **One identity control.** The route header showed the table name AND an in-body full-width
  `Select` card repeated it — the exact duplication the route-header rules forbid. Both are
  replaced by `TableIdentityMenu`: name + chevron, inline rename, table switcher with search, and
  "New table". `UserTableViewer`'s `showTableSelector` prop and its `Select` block are **deleted**;
  the new `onTablesChange` callback surfaces the already-loaded `get_user_tables` list to the
  header so nothing is fetched twice.
  (2) **The page fills the viewport.** New `fillHeight` prop turns the viewer into a flex column
  (chrome / grid / pagination) where only the grid scrolls, replacing the `max-h-[70dvh]` grid
  that floated above dead space with the pagination bar stranded mid-page.
  (3) **Cell cleanup engine.** `UserTableViewer`'s hand-rolled `cleanupHtmlText` /
  `containsCleanableHtml` / `handleBulkHtmlCleanup` are **deleted** and replaced by the new value
  engine in `lib/content-cleanup/` (see its FEATURE.md) plus the shared `<CellCleanupButton>`.
  The headline fix: a value wrapped **entirely** in backticks (`` `parent_id` ``) is unwrapped,
  while interior code spans (``The dot-path id, e.g. `a.b.c`. Stable``) are left alone. Writes go
  out as ONE `udt_bulk_write` merge. `TableToolbar`/`EditRowModal` props renamed accordingly
  (`cleanCellValue` / `isCellValueDirty` / `cleanupControl`).

- `2026-07-23` — **`/documents/[id]` scroll + header conformance.** Two independent bugs.
  (1) **Scroll was dead** because agent-written snapshots store `documentStyle: {}` — with no
  `pageSize` Univer has no page box, so text never wraps and the docs viewport reports no
  scrollable extent (the wheel is received, `preventDefault`ed, and nothing moves). The page
  geometry is now ONE primitive, `features/data-tables/document-page-style.ts`
  (`DEFAULT_DOCUMENT_PAGE_STYLE` / `defaultDocumentPageStyle()`), consumed by `DocumentEditor`'s
  empty doc, `markdown-to-univer-doc`, and a new loud recovery in `sanitizeUniverDocSnapshot`
  (`restorePageStyle`) that stamps it back on any snapshot that arrives without it. **Every writer
  of a Univer document snapshot MUST stamp this style** — the recovery firing means a writer is
  broken (FOUND_DEFECTS D96, aidream owns the server-side writer).
  (2) **Header overlap:** the editor's static status/action row sat at `top: 0` under the glass
  shell header, hiding Save/History behind the avatar. The route body now takes
  `pt-[var(--shell-header-h)]` (the body-type rule for a static top bar), and the `pl-8`/`pr-8`
  avatar-dodge hacks plus the now-unused `toolbarLeftSlot`/`toolbarRightSlot` props are deleted.
  `/documents` got the same clearance so the search toolbar stops colliding with the title and the
  New button; the secondary reference-copy action hides below `sm` to keep the mobile budget.
- `2026-07-14` — codex: **Structured List naming clarified.** Added the product/data concept:
  Structured Lists are editable item collections that can be consumed as picklists/dropdowns, but
  are not read-only or dropdown-only. Documented the boundary with typed datasets: fixed item shape
  plus grouping vs. dynamic columns, typed cells, validation, history, and bulk operations.
- `2026-07-14` — codex: **Structured List database rename.** Canonical backing tables are now
  `workbench.udt_structured_lists` and `workbench.udt_structured_list_items`; `structured_list` is
  registered in `platform.entity_types` and the shareable resource registry.
- `2026-06-22` — claude: **Convert-to-table naming — no duplicate failures.** `createDatasetFromTable` now runs every name through `resolveUniqueDatasetName` (ordinal/date/timestamp fallbacks). Chat table convert derives the preferred name via `deriveDatasetNameForChatTable`: last `# heading` in the source message before the artifact, then artifact title, then column headers, then generic fallback.
- `2026-06-19` — claude: **Dialog nested dropdown z-index fix (`/data/[id]` modals).** Shared Radix primitives (`Select`, `Popover`, `DropdownMenu`, `Tooltip`) now portal into the active `DialogContent` via `useNestedPortalContainer` and render at `z-[10001]` (above dialog overlay/content at `z-[10000]`). Fixes Select/DropdownMenu/Popover menus appearing behind Edit Row, Table Settings, Reference Overlay, and other table modals. Replaced raw `<Button>`, custom search pill, and `HubToolbarToggle` with `DocumentsHubToolbar` (`TapTargetButtonGroup` for card/table/sort view, controlled search input, `PlusTapButton` / `LoadingTapButton`). Added `LayoutGridTapButton` + `ListTapButton` pre-composed icons.
- `2026-06-18` — claude: **Real root cause of the `<ParagraphMenu>` "reading 'key'" crash: string vs numeric `NamedStyleType`.** Univer's `NamedStyleType` is a **numeric** enum (`HEADING_1=4`, `HEADING_2=5`, `HEADING_3=6`, …), but some snapshots (from an external markdown→Univer converter) stored `paragraphStyle.namedStyleType` as the **string** `"HEADING_1"`. Univer does `HEADING_ICON_MAP[namedStyleType]` → string key is `undefined` → `icon.key` throws inside `<ParagraphMenu>` the instant the cursor lands in a heading, tearing down Univer's React root so the doc disappears. (Only fires when focused/cursor-in-heading — reproduced in the owner's session, not a no-interaction load, and only on docs with headings.) Fixes: **(1)** new loud recovery util `utils/sanitizeUniverDocSnapshot.ts` normalizes string→numeric `NamedStyleType` before every `createUniverDoc` (boot + remote reload) and `console.warn`s when it fires; **(2)** one-time idempotent DB repair converting string `namedStyleType` → numeric across `udt_document_snapshots` (2 docs / 31 snapshots). Debugging note: the real doc was owned by a different account, so testing as `admin@admin.com` first surfaced an unrelated RLS read-deny — reproduce as the resource owner.
- `2026-06-18` — claude: **Univer integration aligned to official docs — single-boot lifecycle + native theming (documents + workbooks).** Root-caused the "content loads then vanishes after ~1–2s + `Cannot read properties of undefined (reading 'key')` in `ParagraphMenu`" crash: the boot effect depended on `[id, editable, collab]`, so the async owner/permission check flipping `editable` `false`→`true` tore Univer down and recreated it; disposing Univer mid-render crashed its popups. Fix (per https://docs.univer.ai): **(1) Lifecycle** — Univer now boots EXACTLY ONCE per id (boot effect deps `[id]` only); `editable` / `collab` / collab host-election are read from refs inside the long-lived command listener, so prop toggles never recreate the instance. The `[id]` pages also gate the editor mount on `permsResolved` so editability is known before mount. **(2) Theme/dark mode** — replaced the `colorScheme: "light"` CSS hack (which broke dark mode and fought Univer's portals) with Univer's real theming: `createUniver({ theme: defaultTheme, darkMode })` + new shared hook `hooks/useUniverDarkModeSync.ts` that mirrors the app's Redux `theme.mode` to `univerAPI.toggleDarkMode(isDark)`. Removed the global `color-scheme: light !important` popup overrides in `app/globals.css` (kept only toolbar-geometry rules).
- `2026-06-18` — claude: **`/documents` hub — card overflow fix + table view.** Landing page
  cards now constrain long names/descriptions (`min-w-0`, `truncate`/`line-clamp-2`). Added search
  bar, cards/table toggle (persisted), sort menu for cards, and `DocumentsHubTable` with per-column
  sort + filters (name, description, source, created, updated) — mirrors transcripts hub table,
  no grouping.
- `2026-06-16` — claude: **Agents can attach + edit workbooks/documents.** New
  `{Workbooks,Documents}ResourcePicker.tsx` + entries in `ResourcePickerMenu.tsx` let users attach
  a workbook/document to a chat (emitting the `input_workbook`/`input_document` resource blocks that
  were already type-wired). The agent creates/reads/edits the actual Univer content through new
  **backend** action-dispatched tools (`workbook` / `document`, `action: create|read|edit`, in
  `aidream/services/udt_content/`). See Key flow 6. FE: pickers only (no migration, no slice).
- `2026-06-16` — claude: **Save Table → existing dataset (append / replace + smart column
  reconciliation)**. New shared, Supabase-free `features/data-tables/reconcile.ts`
  (`reconcileColumns`, `autoMapColumns` moved out of the JSON dialog, `mapRowsToFields`,
  `findDuplicates`) and engine `features/data-tables/save-to-table.ts` (`appendToTable` /
  `replaceTable` / `fetchExistingRows`, all committing through a single `udt_bulk_write`
  transaction; opt-in new-column creation via `add_column_to_user_table`; dedupe = skip or
  `op:'merge'` update). The markdown `SaveTableModal` gained a collapsed "Save to an existing
  table instead" disclosure (target picker → live column-diff summary → Append/Replace toggle →
  optional dedupe; Replace gated by `<ConfirmDialog>`). The JSON `AppendToTableDialog` now
  consumes the same engine — its per-row `addRow` loop replaced by one atomic `appendToTable`,
  and its local `autoMap`/`SKIP` deleted in favor of the shared module. No DB migration (existing
  `udt_bulk_write` / `add_column_to_user_table` / paginated reader cover it).
- `2026-06-16` — claude: **Markdown → Document/Workbook export targets**. New
  `markdown-to-univer-doc.ts` converts a markdown string to a Univer
  `IDocumentData` snapshot — rendered content (headings, bold/italic, lists,
  tables, code), never literal markdown syntax; strips `<think>` blocks. New
  `export-targets.ts` adds two canonical, content-agnostic push helpers:
  `pushMarkdownToDocument(markdown, name?)` → `udt_documents` (powers the live
  "Save to Document" action in the chat message menu + RichDocument overflow,
  replacing the old "Add to docs" stubs) and `pushTableToWorkbook({name,
  headers, rows})` → `udt_workbooks` (powers the new "Workbook" button on our
  fancy markdown tables — `StreamingTableRenderer` + `MarkdownTable` — alongside
  the existing data-table "Save"). Both return a `PushResult { href }` and are
  lazy-imported by consumers so Univer stays out of the chat bundle. (Parallel
  `pushToWorkbook` in `features/page-extraction/data-review` remains its
  feature-bound adapter; this is the generic version.)
- `2026-06-12` — claude: **Cloud Documents surface launched (`/documents`)**. Sibling to
  `/workbooks` — same architecture, Univer's `preset-docs-core` instead of
  `preset-sheets-core`. New DB tables `udt_documents` + `udt_document_snapshots`
  (migration `udt_v2_documents.sql`, applied live) — RLS + shareable_resource_registry
  entry + supabase_realtime publication mirror workbooks 1:1. New
  `document_source` enum: `created | imported_docx | imported_md | imported_txt`.
  New service: `features/data-tables/document-service.ts` (mirror of
  `workbook-service.ts`). New hook: `useDocumentRealtime`. New components:
  `DocumentEditor.tsx`, `DocumentHistoryViewer.tsx`. New routes:
  `app/(core)/documents/{layout,page,[id]/page}.tsx` — auth-gated, dynamic-import
  the editor with `ssr:false` (Univer needs `window`). New landing:
  `features/auth/components/module-landing/landings/DocumentsLanding.tsx`. Nav
  entry added in `features/shell/constants/nav-data.ts` (icon `FileText`).
  Permission registry mirror updated (`utils/permissions/registry.ts`).
  **Collab reused, not duplicated:** `SupabaseYjsProvider` gained an optional
  `channelPrefix` (default `"workbook"`); docs pass `"document"` so the
  channel becomes `yjs:document:<id>`. `WorkbookCollabSession` itself is
  resource-id-agnostic — `documentId` flows through its `workbookId` slot.
  Future rename to `UniverCollabSession` tracked as tech debt; the current
  shape works on the docs ICommandService unchanged because Univer exposes a
  single command service for both presets and `onMutationExecutedForCollab`
  fires on docs mutations the same way.
- `2026-06-06` — claude: **Final-pass closeout — retention policy + FK to cld_files + smart importer**.
  Decisions locked with the user: Wave H = keep latest 2 OR within 14 days (weekly pg_cron);
  aidream attribution stays NULL (honest); CRDT collab v2 green-lit but scoped to "after the
  rest." Migrations: `udt_v2_retention_and_original_file_fk` applied live — trim function +
  cron schedule + `udt_workbooks.original_file_id → cld_files(id) ON DELETE SET NULL`. Workbook
  import now stashes the source XLSX/CSV via `fileHandler.upload()` and stores the `cld_files.id`
  on the workbook row (failure non-fatal). Smart importer (P3) shipped:
  `features/data-tables/smart-importer.ts` (7-signal heuristic) +
  `components/ImportRouteDialog.tsx` + `smart-import-pickup.ts` (cross-route File handoff slot)
  + `Sparkles`-icon "Smart import" button on `/workbooks` + receive-side wiring on `/data` +
  `prefilledFile?: File` prop on `ImportTableModal` (auto-processes on open).
- `2026-06-05` — claude: **Workbook share + permission gating**. Added `udt_workbooks` to
  `utils/permissions/registry.ts` so `<ShareButton resourceType="udt_workbooks" />` works
  (DB-side registry entry was already added in P1; the TS mirror was stale). `/workbooks/[id]`
  header gets the share button on the right. The page calls `has_permission(udt_workbooks, id,
  'editor')` at mount and passes `editable` down — owners always edit; users shared with editor
  permission edit; everyone else sees viewer mode (no autosave, no Save now, name input
  disabled). Matches what the RLS-protected RPCs would accept, so the UI does not lie about
  what's possible.
- `2026-06-05` — claude: **Export XLSX + Wave E (column type-change UI)**.
  `features/data-tables/univer-to-xlsx.ts` symmetrises the import path — SheetJS-based
  conversion of a Univer `IWorkbookData` snapshot back to `.xlsx` (values + types + formula
  source per sheet). Wired as a toolbar "Export" button in `WorkbookEditor`; filename = workbook
  name. Wave E lands in `TableConfigModal`: when a field's `data_type` is changed, save now
  shows a destructive-confirm with the old→new summary; on confirm, each changed column runs
  `udt_change_field_type({strategy:'cast_or_null'})` after the metadata RPC; result toast shows
  total rows rewritten. Per-column failures are surfaced individually.
- `2026-06-05` — claude: **P4 v1 polish — XLSX/CSV import + snapshot history + Save-now**. Three
  follow-ups landed on top of the workbook surface:
  - `features/data-tables/xlsx-to-univer.ts` — SheetJS-based converter that turns an uploaded
    `.xlsx` / `.xls` / `.csv` into a minimal Univer `IWorkbookData` (values + types + formula
    source per sheet; ISO dates for date cells). Multi-sheet workbooks become multi-sheet
    Univer docs. Pre-flight parse before creating the workbook row so failure does not leave a
    husk.
  - `/workbooks` page — new "Import XLSX / CSV" button that runs the converter, calls
    `createWorkbook({source: 'imported_xlsx' | 'imported_csv'})`, saves the parsed shape as an
    `origin: 'imported'` snapshot, then routes to `/workbooks/[id]`. On `saveSnapshot` failure
    the husk workbook is deleted as best-effort rollback.
  - `WorkbookHistoryViewer` component — lists snapshots newest-first with origin badges
    (autosave / manual / imported / restored), highlights the current one, and offers per-row
    "Restore" that writes a NEW `origin: 'restored'` snapshot containing the chosen JSON.
    Realtime hook in `WorkbookEditor` hot-swaps to it automatically. Snapshots are append-only
    — Restore is non-destructive.
  - `WorkbookEditor` toolbar — adds "Save now" (manual labeled save, cancels pending autosave)
    and "History" (opens a Sheet containing `WorkbookHistoryViewer`). Editor stays
    self-contained; the page just renders `<WorkbookEditor workbookId={id} />`.
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
