# FEATURE.md — `data-tables` (User Data Tables / `udt_*`)


**Status:** `migrating`
**Tier:** `1`
**Last updated:** `2026-09-14`

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
- ✅ **Table-native selection + scoped copy** — every `UserTableViewer` surface has persistent page-spanning row checkboxes, the canonical `CopyButtons` pair (Copy table · Copy JSON · Current table view for AI · selected rows · downloads), and **"Filter & sort before copying…"** — the platform `copy-subset` primitive (`components/agent-copy/copy-subset/FEATURE.md`) over the COMPLETE table: the canonical `MatrxDataTable` search, whole-word matching, per-column filters, layered advanced filters, sorting, pagination, selection, column show/hide, format switch, live count + size. (2026-09-11: replaced the UDT-only `TableCustomCopyWindow`, deleted.)
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
- ✅ **Bulk paste from Excel / Sheets clipboard** into the typed-dataset grid — Cmd-V on a selected cell lands a TSV block downward and rightward in one transaction (2026-09-14, see § Grid clipboard + right-click menu).
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
- `features/data-tables/table-style.ts` (colors model: color-by / rules / highlights, pure) +
  `components/ColorRulesDialog.tsx` (the Colors dialog) + `scripts/seed-udt-example-tables.ts`.
- `features/data-tables/grid-clipboard.ts` (TSV parse / serialize + `planPaste`, pure) and
  `features/data-tables/grid-context-menu.ts` (the grid's cell / row / column menu sections +
  the DOM-anchor resolver, pure `build*`) — consumed by `UserTableViewer` + `useGridSelection`.
- `features/data-tables/components/TableCopyControls.tsx` + `table-copy.ts` — the shared user-table copy control (canonical `CopyButtons`; row/column shaping through the platform `copy-subset` window, `components/agent-copy/copy-subset/`) and pure projection/Markdown/AI-envelope builders. `UserTableViewer` mounts the controls once, so route, quick-data sheet, resource picker, canvas, modal, dataset overlay, and WindowPanel consumers stay identical.

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
    row's JSONB cell; strategy `cast_or_null` (default) or `cast_or_skip`. 🚨 **A value that
    cannot become the new type goes to the row's history WITH the reason before its cell is
    emptied** (`reason = 'type_change:<from>→<to>'`, Data Doctrine Rule 3), in the same
    transaction; the call RAISES and changes nothing if fewer values reach history than it is
    about to empty. Returns `values_moved_to_history` + `history_reason` — every screen that
    runs a type change MUST say the number and the way back (DD-244).
  - `udt_cast_jsonb_value(p_value, p_new_type)` — the ONE cast rule (SQL NULL = does not fit),
    so "does this fit?" and "what does it become?" can never disagree.

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
- Walks every row, rewrites the JSONB cell (`udt_cast_jsonb_value`; un-castable → emptied or
  left in place per strategy), then flips `udt_dataset_fields.data_type`.
- Under `cast_or_null`, every un-castable value is first written to that row's history carrying
  `reason = 'type_change:string→integer'` — the history row is the ONLY surviving copy, and the
  call refuses outright (rolling back) if it cannot prove the history landed.
- Exit: `{ field_id, new_type, strategy, rows_rewritten, rows_skipped, rows_total,
  values_moved_to_history, history_reason }`. `TableConfigModal` shows the count, says the values
  are in each row's history, and names Restore as the way back; `VersionHistoryViewer` badges that
  version "Column type changed (string→integer)".

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

- **Dataset sharing uses `ShareButton` with `resourceType="dataset"`.** The desktop toolbar, mobile actions, and Table Settings footer open the universal Users / Organizations / Public dialog. Settings never writes table-level `is_public`; visibility belongs to the sharing system. The padding-free settings dialog resets footer side margins and gives tab content a shrinking scroll area so status and actions remain visible.

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
- **Ambient assistant runway lives on the real natural-height scroller.** `/data` and `/data/create` put `scroll-page-end-space` on their inner scrolling leaf. The shared Data route wrapper is a clipped full-height host and must never own that padding: doing so subtracts the runway from every child's usable height. `ScrollAssistantLauncher.includePathnames` limits the single-line dock to those two natural-height routes; `/data/[id]` is a full-height editor and deliberately has no floating composer.
- **`/data/[id]` renders the viewer in `fillHeight` mode.** Three bands — chrome, grid, pagination
  — where only the grid scrolls. Embedded surfaces (windows, sheets, chat artifacts, pickers)
  leave it off and keep the content-sized `70dvh` cap. There is no in-body table selector any
  more: `onTablesChange` hands the list to whatever surface owns the switcher, so the RPC is
  fetched once and the header owns the choice.
- **Selection belongs to the table system, not an export modal.** `UserTableViewer` owns the persistent source-table selection. The custom-copy WindowPanel consumes that selection as one quick scope and uses `MatrxDataTable`'s controlled selection for its live output projection: page select, Shift-range, select all, clear all, or only the rows matching the current search/filter stack.
- **Quick copy means the complete current view, never the loaded page.** Copy and Copy for AI read the full table through `getCompleteTable()` and then apply the active search, column filters, and sort. Copy emits Markdown. Copy for AI uses the canonical XML envelope with table identity, row/column counts, and friendly display-name keys. The direct actions are icon-only with accessible names. "Filter & sort before copying…" opens the platform `copy-subset` window (every column and row included by default, the viewer's current selection pre-ticked): searchable column chooser on the left; the canonical table's global/whole-word search, sortable/filterable columns, layered advanced filters, pagination, and row selection on the right; format switch (For AI / Markdown / CSV / JSON), exact counts, live size estimate, and the copy action in the footer. Large and small tables use the same window.
- **`validation_mode='permissive'` enforces NOTHING.** It is a pure passthrough so the 118
  pre-existing datasets keep their exact prior write behavior. Enforcement is opt-in via
  `'strict'`. Do not "helpfully" make permissive enforce things — that silently breaks live data.
- **Required-field grandfathering (strict).** A required field only raises on INSERT, or on
  UPDATE that *drops a previously-set value*. Rows that were *already* missing a required field
  (26 such rows existed at P1) stay editable on their other fields. This is intentional.
- **Realtime fanout.** `udt_dataset_rows` is in the `supabase_realtime` publication — a 10k-row
  import emits 10k events. Importers MUST batch via `udt_bulk_write`, and only the UI viewing a
  given dataset should subscribe. Do not subscribe app-wide.
- **Version retention is a knob, per organization, raise-only.** `udt_dataset_row_versions_trim_scoped`
  (the weekly `udt_dataset_row_versions_trim_weekly` cron calls the zero-arg wrapper) keeps the
  latest 2 versions of every row plus everything newer than that organization's
  `extensibility.user_tables.history_retention_floor_days` — **default 30 days, `raise_only`**
  (Data Doctrine Rule 10). It was a hardcoded platform-wide **14 days** until DD-244, which
  together with `cast_or_null` meant the only copy of a value a type change could not keep was
  deleted two weeks later. Heavy agent traffic still grows the table — budget for archival.
  Guard: `pnpm check:udt-history` (`scripts/check-udt-history-honesty.ts`).
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

A retired old Matrx Main project is still healthy,
still accepts DDL, and holds a **stale copy of real data** — same table ids,
same row ids. A migration applied there succeeds, and reading it back confirms
exactly what you hoped, while the app never sees the change. This cost a
round-trip on 2026-08-21: `get_user_tables` was "verified" returning
`visibility` while every card in the UI still said "Sharing unknown".

**A DB read that agrees with you is not proof you wrote to the right database.**
When it matters, check what the app actually talks to — intercept `fetch` in the
browser and read the `/rest/v1/` origin.

### The cell is the target, and the cell carries the state

**🚨 The `<td>` owns click and double-click — never the content inside it.** The
content is smaller than the cell (and an EMPTY cell has almost none), so
handling clicks on the inner element meant only the middle of a cell responded
and **an empty cell could not be edited at all**. Direct-click widgets
(checkbox, rating, choice) stop propagation so they do not fight the cell.

**The editor has no chrome of its own.** Transparent background, no border, no
focus ring, same padding as the read view — an input with its default border
draws a second rounded box inside the cell's own ring, which reads as a
component nested in a component.

**But the cell MUST still show that an editor is open.** Selected is a soft ring
(`ring-2 ring-primary/70`, `bg-primary/5`); editing is heavier and solid
(`ring-[3px] ring-primary`, `bg-primary/10`). Stripping the input's border once
removed the only signal an editor was open, and a cell holding unsaved text
became indistinguishable from a saved one — that is how an edit gets lost
without anyone noticing.

### Columns: the view's, not the table's

🚨 **PER-VIEW, NOT PER-TABLE.** `ColumnViewMenu` (beside the grid) changes only
what YOU see — it writes `hide` / `ord` to the URL and never touches
`udt_dataset_fields.field_order`, which is the table's shared default and
belongs to everyone who opens it. **Table Settings still owns that.** Two people
can hold two different views of the same table at once. Do not "simplify" the
two controls together.

`viewFields` (what the grid draws) and `fields` (the table's full truth) are
deliberately separate: hiding a column from your view must never hide it from
the row editor, from export, or from an agent reading the schema.

**The merge rules are what let a saved view survive a changing table**
(`resolveViewColumns`): a name the table no longer has is DROPPED so there is no
hole; a column the table gained that the view never heard of is APPENDED in the
table's own order rather than being invisible; `hidden` is applied last so
hiding never disturbs ordering. The last visible column cannot be hidden — an
empty grid looks broken and offers nothing to click to recover.

### Saved views

A saved view is **the URL made durable** — the same state the query string
already carries (search, sort, filters, columns, order, page size, layout: fit/scroll, dragged column widths, row height, frozen first column) under a name
you can return to. Applying a view writes the URL through the same setters a
click uses, so the address bar still describes what is on screen and the link is
still shareable. **A view is a shortcut to a URL, never a second source of
truth**, which is why there is no second state to drift.

Stored in **`platform.saved_view`** — the platform-wide table, not a
feature-scoped one. `surface_key` says which list; `subject_id` narrows it to
one record of that list (the dataset). Every read filters on both.

**The page number is deliberately NOT stored.** "Page 4" is where you happened
to be, not what the view IS, and the row that was on page 4 last week is not
there now. Applying a view always lands on page 1.

🚨 **A LINK ALWAYS BEATS YOUR DEFAULT.** The default view auto-applies only when
the URL arrives pristine. If someone opened a colleague's link, a bookmark, or
pressed Back, applying their own default over it would silently show them
something other than what they asked for.

**Clicking a view chip always APPLIES it.** An earlier version toggled — so
clicking the active chip cleared it, and the obvious gesture for "put me back"
did the opposite. Un-applying is what Reset view is for, and Reset view also
clears the active chip so the bar never claims a view that is not on screen.

**The definition is jsonb and validated per FIELD on read.** One corrupt filter
blob must not also discard the column layout someone arranged. Bump
`SAVED_VIEW_DEFINITION_VERSION` when the shape changes and teach the parser the
older shapes.

## Grid clipboard + right-click menu (2026-09-14)

**Copy / cut / paste act on the SELECTED cell, no editor needed.** Cmd-C copies
the cell's text; Cmd-X copies and clears it; Cmd-V writes the clipboard over it.
A paste carrying a spreadsheet block (tabs / line breaks, Excel quoting) lands as
a block from the selected cell downward and rightward, in ONE `udt_bulk_write`,
every cell on the undo stack; rows that fall below the page are offered as new
rows (confirm) and columns that fall off the right edge are reported. The pure
model is [`grid-clipboard.ts`](./grid-clipboard.ts) (TSV parse / serialize,
`planPaste`) with its tests; the React shell is `useGridSelection`, which
serves BOTH clipboard doors — the native `copy` / `cut` / `paste` events (the
browser Edit menu, `event.clipboardData`, no permission prompt) and the keyboard
chords, which arm a pending gesture and fall back to the async Clipboard API
only when no native event claims it (Chromium fires none on a focused `<div>`
with nothing text-selected). A real text range highlighted inside the grid is
always the browser's to copy.

**A choice cell selects on the FIRST click and opens its chooser on the
second** (or Enter). Opening it on the first click moved focus into the
chooser's search box and every grid shortcut went there — a choice column could
not be copied at all.

**The grid mounts ONE v3 right-click menu** (`NonEditableContextMenu` around
the scroll container; `resolveContextOnOpen` reads the clicked `<td data-cell>`
/ `<tr data-row-id>` / `<th data-field>`). Right-clicking a cell selects it. The
menu's own Copy copies the cell (scope `content` = the cell text). Sections from
[`grid-context-menu.ts`](./grid-context-menu.ts) — **Cell** (Cut · Paste ·
Clear · Edit), **Row** (Edit… · Duplicate · Copy row as TSV · Row history · Get
reference… · Delete…), **Column** (Sort A→Z / Z→A · Clear sort · Hide · Column
settings… · Delete…) — plus the shared dataset section
(`buildDatasetTableMenuSection`, "Open in Data Workspace" disabled on the route
itself). Every item delegates to a handler the toolbar / header menu / row
actions already call; view-only tables keep every row, disabled with the reason.
The menu carries `surfaceName` only on the `/data/[id]` mount (inside another
surface's window it resolves the host). The surface's `current_cell_value` /
`current_column_name` / `current_row_id` now follow the SELECTED cell, not only
an open editor.

## Colors — color-by, rules, manual highlights (2026-09-14)

**The Airtable line, not the Excel line** (Arman, 2026-09-14: "do what the best do and
just do it better, not get crazy with features"). A typed dataset is not a canvas —
Workbooks already are — so color here carries MEANING and never touches the data:

1. **Color by a column.** A choice / multi-choice / boolean column tints the row (or
   only that column's cells) with each option's own chip color. An option that never
   declared a color gets a stable palette color by position (`colorForChoice`), so
   "color rows by Status" always paints something. Booleans tint checked rows green.
   Right-click a column header → "Color rows by this column", or the toolbar **Colors**
   dialog.
2. **Rules.** "When Budget > 50000 tint the cell amber", "when Status is Blocked tint the
   row red" — evaluated live on the client, first matching rule wins, top to bottom.
   Edited in the **Colors** dialog ([`components/ColorRulesDialog.tsx`](./components/ColorRulesDialog.tsx)).
3. **Manual highlights.** A cell, a row or a column from the right-click menu
   ("Highlight cell / row / column ▸"), the same seven-color palette the choice chips
   use. Manual always wins over rules; a cell tint paints over a row tint.

**Where it lives.** `udt_datasets.metadata.style` — one blob per table, read with the
table's own metadata (`get_full_table` → `tableInfo.metadata`, zero extra requests),
written by PATH through `public.udt_set_table_style(p_table_id, p_path text[], p_value)`
(migration `udt_table_style_and_example_tables.sql`; editor-gated by
`workbench.udt_dataset_access`; a null value deletes the key and prunes empty parents).
Surgical paths are what let two editors highlight different cells without clobbering
each other. Model, parsing, precedence and class maps: [`table-style.ts`](./table-style.ts)
(tests in `__tests__/table-style.test.ts`). The grid patches its local copy optimistically
and adopts the server's returned style on success. Copy, export, the agent scope and the
row data never see colors. Realtime does NOT yet push style changes to other viewers
(the viewer subscribes to rows only) — a reload shows them.

## Examples — the platform's read-only showcase tables

**Read-only for EVERYONE (2026-09-15, found by the independent reviewer):** the examples are
owned by `admin@admin.com` in the global system org, and `isReadOnly` was "not the owner and
not a shared editor" — so the one account every agent signs in as could edit, rename and
delete the showcase every user sees. `UserTableViewer` now resolves the system org
(`resolveSystemOrgId`) and treats any table whose `organization_id` is that org as read-only
regardless of ownership (the View Only notice says why); the Examples cards on `/data` render
without rename/delete. The seed script is the examples' only writer.

`/data` gains an **Examples** section: datasets owned by the Matrx System organization,
listed by `public.udt_list_example_tables()` (SECURITY INVOKER — RLS decides; every
signed-in user is a viewer through the platform-global tier, super admins can edit).
`get_user_tables` is untouched and still means "my tables". The content is seeded by
`scripts/seed-udt-example-tables.ts` (three tables: Project Tracker — every column
format, color-by Status, a rule, manual highlights; Product Catalog — rules on stock;
Team Directory — color-by Department on cells; plus one shared pick list for the
dependent Team column). Seeded live 2026-09-14 (Project Tracker `ce73458f`, Product
Catalog `437ad3e2`, Team Directory `6a4b2950`). The first run was refused by RLS because
`udt_datasets.std_insert` needs `iam.has_org_access(organization_id)`, which was pure
membership, and the system org has no members BY DESIGN (Arman: "if something is requiring
it to have a user before it can store things, that is the problem"). Fixed at the class:
`migrations/iam_org_access_platform_admins_manage_global_system_org.sql` — the org lane
(`iam.has_org_access_for` / `my_orgs`) admits a super admin on a `global_readable` system
org, the write-side twin of the platform-global read tier. `--reset` rebuilds an example.

## Right-click menu additions (2026-09-14, second pass)

Row: **Add row…**, **Highlight row ▸**. Column: **Insert column left / right…** (the
add-column modal takes `insertAtOrder`; after the column lands, `renumberFields` shifts
the columns at and after that slot by one), **Highlight column ▸**, **Color rows by this
column** / **Stop coloring…** (disabled with the reason on non-choice columns), **Table
colors…**. Cell: **Highlight cell ▸**. Highlights show a ✓ on the color already applied.

## Range selection — cells, rows, columns (2026-09-14, Arman: "go ahead and build those")

A selection is an ANCHOR (the ringed cell) plus an optional FOCUS (`CellRange` in
`grid-selection.ts`, resolved against the grid's current order so a re-sort cannot
move it). Gestures: **shift-click** extends; **press-and-drag** across cells sweeps
(`select-none` on the grid while dragging); **shift+arrows** grow the range;
**click a header's own surface** (not its sort label / menu) or **Ctrl/Cmd+Space**
selects the column; **click beside a row's checkbox** or **Shift+Space** selects the
row; **Cmd/Ctrl+A** selects the page. Escape collapses the range first, then clears.
Copy / cut / Delete / paste act on the range: copy writes the block as TSV
(Excel-paste-ready), Delete or cut clears every cell in ONE `udt_bulk_write` with each
cell on the undo stack, pasting ONE value over a range FILLS it, a block still lands at
the anchor, and **Cmd-D / "Fill down"** copies the range's first row down. Right-click
inside the range keeps it and the Cell section becomes "Cells · N selected" (cut / clear /
paste over / fill down / highlight N cells). The ticked-checkbox rows are a separate
model (bulk actions) and stay that way. **Agents see both:** `selected_range_tsv` (+
`selected_range_cell_count`, a header line of machine field names first) and
`selected_rows_json` on the `matrx-user/data-tables` surface — "these cells" / "these
rows" now mean something to an agent.

**Live colors.** `useTableRealtime` carries a second binding on the SAME channel —
`workbench.udt_datasets` UPDATE for this table id — so a rename, a description or a
color change by another editor lands without a reload (own writes echo harmlessly: the
row IS what the grid already holds). Publication verified by `pnpm check:realtime-publication`.

## Validation rules — what a column ACCEPTS (2026-09-14)

Three questions can be asked of a column, and the Table Settings card now asks
all three in one row: what it **Stores** (the storage type), what it **Shows as**
(the display format), and what its **Rules** accept.

The rules live on `workbench.udt_dataset_fields.validation_rules` (jsonb — a
column that existed since the v2 backbone and was read by nothing). The model,
the parser and the judge are ONE pure module: [`validation.ts`](./validation.ts).
Champions: Excel's data validation (a rule per column; an invalid entry is
refused *with the reason*) and Airtable (type-level only — we go past it).

```ts
type ValidationRules = {
  required?: boolean;     // MIRROR of is_required — never stored, never written
  min?: number; max?: number;                  // number-ish columns
  minLength?: number; maxLength?: number;      // text-ish columns
  pattern?: string; patternHint?: string;      // JS/PG-compatible, anchored by the author
  allowedValues?: string[];                    // NON-choice columns only
  unique?: boolean;                            // checked by the caller, never by the trigger
};
```

**The four laws.**

1. **`required` is not stored here.** The column already declares `is_required`
   and the card already has the Req checkbox. `parseValidationRules` never
   invents the key and `serializeValidationRules` always strips it. One fact,
   one home.
2. **An empty value is never a violation.** Emptiness is `is_required`'s
   question, asked once, by whoever owns the whole row. Otherwise a `min: 0`
   would quietly make every optional number column mandatory.
3. **A rule judges what the user is WRITING, never what is already stored.**
   Existing values that break a new rule are kept, never rewritten, and render
   in the SAME amber THE FALLBACK LAW already uses for a format mismatch —
   `<FormattedFieldValue validationRules>`, one amber, one voice. Declaring a
   rule over existing data is how a user FINDS the values that do not fit,
   exactly as declaring a choice column's options is.
4. **`allowedValues` is refused on a choice column.** Its options live in its
   format, are offered in the picker, and an off-list value there is legal and
   amber by design. A second list would be a second vocabulary for one column.
   `validateCellValue` skips the rule when the format is `choice`/`multi_choice`
   and `ColumnValidationEditor` does not offer it.

**Where it is enforced — the browser first, the database as a backstop.**

| Path | File | What refusal looks like |
|---|---|---|
| Inline cell edit | `components/EditableCell.tsx` | Toast with the reason; the editor STAYS OPEN holding what was typed (same as a server refusal) |
| Add row | `components/user-generated-table-data/AddRowModal.tsx` | Inline red line under that field; the rules print under every field that has them |
| Edit row | `components/user-generated-table-data/EditRowModal.tsx` | Same |
| Agent write (`cell_value`) | `hooks/useDataTableWriteHandlers.ts` | THROWS the reason plus every rule the column carries, so the retry is informed |
| Database | `public.udt_validate_row` → `public.udt_validate_cell_rules` | **`validation_mode='strict'` ONLY** |

Client enforcement is unconditional — it does not consult `validation_mode`,
because strict mode is a database backstop, not the user's error message. The
DB half keeps the standing invariant intact: permissive stays a pure
passthrough (§ Invariants).

**The reason strings are the product, and the two engines must agree on them
word for word.** `features/data-tables/validation.ts` and
`public.udt_validate_cell_rules(p_rules jsonb, p_value jsonb, p_data_type text)`
are twins: `Must be at least 0`, `Must be at most 100`, `Must be at least 3
characters (this is 2)`, `Must match the pattern ###-####`, `Must be one of:
Red, Green, Blue`. The TS half is pinned by
`__tests__/validation.test.ts` (39 cases); the SQL half by a DO block inside
`migrations/udt_validation_rules_strict_enforcement.sql` (26 cases) that runs
in the same transaction, so the migration cannot land if the wording drifts.

**`unique` is NOT enforced by the trigger, on purpose.** A cross-row check
inside a per-row BEFORE trigger cannot see a concurrent insert — it would be a
guarantee that is not one — and it walks the table on every write. It is checked
by the caller against the rows it holds (`existingValues`), which catches the
common mistake honestly; the editor says so in as many words. A real guarantee,
if one is ever wanted, is a unique expression index, not a trigger.

**Saving.** Rules ride the SAME write every other column property uses —
`update_user_table_config`'s `p_field_updates` has always accepted
`validation_rules`. That RPC COALESCEs the column, so `{}` is the only way to
CLEAR rules; `serializeValidationRules({})` returns exactly that. No new RPC.

**Agents can see the rules.** `column_list` entries gain `validation?: string[]`
— the same plain-English phrases the row forms print (`describeValidationRules`)
— so an agent reads the rule instead of discovering it by being refused.

**Not built (said plainly).** The Table Settings card does NOT show "N values
don't fit". `udt_table_profile` returns `top_values`, not every value, so a
count derived from it would be a confident number over a partial set — the exact
failure § Column shape exists to prevent. A real count needs its own RPC and is
not in this pass.

## Formula columns in the grid (2026-09-14; readers unified 2026-09-15)

**THE ONE INJECTION POINT (2026-09-15):** `withComputedColumns(rows, fields)` in
[`formulas.ts`](./formulas.ts) (with `formulaColumnsOf` / `isFormulaColumn`) is the only place a
formula column's value is put into a row. The grid page, `loadRowsForCopy` / `loadAllRows`
(every Copy / Copy for AI / CSV+JSON export / copy-subset window — they all read
`getCompleteTable`, whose rows hold the stored BLANK), the column-filter path, the client-side
sort and the agent scope's `full_table_json` / `selected_rows_json` all call it. A reference
resolves against the table's COLUMNS (machine name, then display name), so a row saved without
that key is BLANK, not the "no such column" `#ERROR` (live-found on the empty sixth row of the
test table; guard `__tests__/computed-columns.test.ts`). Off-grid writes are refused everywhere:
`AddRowModal` / `EditRowModal` render a read-only note instead of an input (and skip the column
in the required and rules checks), `AddColumnModal` offers no default/required control for a
formula column, and the agent `cell_value` target throws with the reason. Header controls: sort
by a formula column is client-side when the browser can hold every row (≤ `CLIENT_SORT_THRESHOLD`,
no search) and otherwise refused with a toast that says why; the column filter's menu is mounted
without `tableId` for a formula column so it works from the browser's computed rows and says
when that is not every row (server facets never see the value).

Live-verified 2026-09-15 on the local preview as admin@admin.com: new column "Double area" via
+ Column → Shows as → Formula → editor ("Valid · uses 1 column"), `{Area (sq km)} * 2` rendered
19193920 for China; sort by it ordered 0 → 34196484; Edit Row showed the read-only note; Copy →
Text carried the computed column; the Project Tracker example renders "Budget per point" as
$2,471 (84000 / 34).

A column whose format is `formula` (`lib/field-formats` — language, coercion rules and the
26 functions in [`formulas.ts`](./formulas.ts), 65 tests) STORES nothing. `UserTableViewer`
computes it at render for every displayed row (`{Display Name}` or `{field_name}` references,
earlier formula columns visible to later ones) and injects the value into the row it renders,
so display, copy, the agent scope and client-side sort all see the same number. A bad
reference or a division by zero renders `#ERROR` with the reason as its tooltip. The cell is
read-only (double-click, Enter, typing and the agent's `cell_value` all refuse), and paste /
clear / fill down skip formula cells and say so. Not sortable or filterable server-side
(`udt_column_facets` / the paginated RPC never see the value) — documented limitation.
**Expression editor:** [`components/FormulaExpressionEditor.tsx`](./components/FormulaExpressionEditor.tsx)
— a popover beside the format picker in Table Settings AND in the new-column form (so a
formula column can never be created without a way to write its expression): live parse
status with the error position (and, since 2026-09-15, an error naming any `{reference}` that matches no column — a reference is judged against the table's columns before save, not only as `#ERROR` after it), the table's other columns as `{Display Name}` chips, the
function list, and "result shows as". It sits in `features/` because the language does and
the picker is a `lib/` module that must not import upward. Not yet exercised live: the shared
preview server was held by another checkout when this landed, so the editor has unit
coverage of the language only — open Table Settings on any table, set a column's format to
Formula, and the editor button appears under it.

## Validation rules in the grid (2026-09-14)

The grid passes each column's parsed rules to `EditableCell` (refuses a violating commit,
stays in edit mode with the reason), to `FormattedFieldValue` (a STORED value that breaks a
rule renders amber with "saved before the rule, and is kept"), to the agent scope
(`column_list[].validation`), and judges pasted values (violations are skipped and named in a
toast). `unique` reads every other loaded row of the column (full cache when held, else the
page). Rule model, editor and strict-mode trigger: § Validation rules (below, by the
validations build).

## Change log

- `2026-09-21` — **Attachment column** shipped (`lib/field-formats/FEATURE.md`): file ids from the files feature, chips in the grid, the one file picker to add, remove on the chip. **Link-to-another-table: DECIDED NOT TO BUILD HERE.** The relation primitive (stored id, one resolver `custom._words_for`, per-field display spec, `ReferenceBuilder`, batch door `relation_words_many`) shipped 2026-09-21 in the RECORD STORE (`/data-v2`, `@ai-matrx/records` 0.46 / `records-ui` 0.65) by lane RELATION-DISPLAY, whose own finding is that this older store has no id-storing relation and giving it one is a store cutover, not a column — and the doctrine register carries that cutover as DD-031 (migrate `workbench.udt_*` into `custom`). A second relation implementation here would be exactly the fork the primitives law forbids. Lookups/rollups follow the relation, so they wait too. Automations (row-action class 4, "run when a row changes") likewise belong to the scheduling/workflow primitives, not this feature.
- `2026-09-21` — **Arman's five grid findings, same day (commit `3f74a576e6`).** (1) A kind that lives on another storage type is one pick away in "Shows as" (`lib/field-formats/FEATURE.md`, `onDataTypeChange`) — Time on a Date & time column retypes it to Text and sets the format together, in Add column, Table settings and the column dialog. (2) **Column settings dialog** (`components/user-generated-table-data/ColumnSettingsDialog.tsx`): "Column settings…" in the header menu and the right-click column section now opens ONE column's dialog — name (`renameColumn`, formulas rewritten), stores (`changeFieldType`, confirmed), shows as (`setFieldFormat`), accepts (`ColumnValidationEditor` → `update_user_table_config`), required, "Names the rows" (row label door), the column's summary (view state), plus Hide / Delete. The draft is keyed on the column, never reset by an effect. Table settings → Fields & Order keeps the all-columns view. (3) The Actions cell's buttons are 28px, gap 0; the column is 112px. (4) The "+" that adds a column has its own slim header cell after the last column (every row and the footer carry the matching empty cell; colSpans count it when not read-only); the Actions header carries a lightning menu listing the table's actions with "Manage actions…" / "Add an action…" opening Table settings ON the Actions tab (`defaultTab` on `TableConfigModal`, `configTab` through the toolbar). Row actions are ALWAYS one icon that opens the list — the single-action inline chip is gone (it rendered giant and unreadable) — and an action may carry `icon` (a registered / Lucide name from the platform icon picker, `IconInputCompact`; rendered by `RowActionIcon` via `@ai-matrx/icons` `IconResolver`, else a bolt / a speech bubble). (5) The summary footer renders only when a column HAS a summary; summaries are set from the new right-click "Summarize column" submenu (`grid-col-summarize`, kinds from `summaryKindsFor`) or the column dialog; the Add row line is 28px. Live-verified 2026-09-21 by an independent pass on the local preview (Time under Other kinds retypes to Text; Column · Capital dialog from both menus with the summary toggling the footer; buttons adjacent with 0 gap; slim + cell, Actions bolt → Actions tab, calendar-icon action ran and undid cleanly; footer absent until Summarize column). Follow-up `[&_button]` selector so the nested buttons are truly 28px.
- `2026-09-21` — **Row actions: one-click buttons on a row (Airtable's button field + "Update record" automation, Notion's database button).** Arman: "if I had a button for 'New Week' I would have it increment the reset date by 7 days, clear the values for total and fable columns and then set the status to AVAILABLE." Model: `features/data-tables/row-actions.ts` — `metadata.row_actions = [{ id, name, color, confirm, kind: "update", steps } | { …, kind: "agent", prompt }]`, a step is `{ field, set: "value", value } | { field, set: "clear" } | { field, set: "formula", expression }`. THE ONE PRIMITIVE: Arman's classes 1 (set the row to a template row), 2 (…but keep some columns) and 3 (…plus an intelligent update) are all `update` actions — "Start from a row…" captures a row as value/clear steps (`stepsFromRow`), the user removes the columns to keep, and a `formula` step is evaluated against the row AS IT IS BEFORE the action with the whole formula language (`DATEADD({Reset date}, 7, "days")`, `IF`, `TODAY()`…), so two steps never see each other's results. Class 5 is an `agent` action: `agentActionMessage` (prompt + the row by its label + every column) launched through `launchMandate(chat.default_new_chat)` in the flexible panel with `surfaceName: "matrx-user/data-tables"`, so the agent has the table's scope and write tools. Class 4 (actions aware of other rows/tables) is deliberately NOT here — automations (handoff item 1). `compileRowAction` refuses computed columns and a formula that cannot evaluate (a blank date under DATEADD) — `buildRowActionOps` then writes NOTHING and names the row, rather than changing 39 of 40 rows silently; a run is one `merge` op per row = ONE `udt_bulk_write` transaction, then every changed cell is patched in place and recorded on the undo stack (Cmd-Z walks "New Week" back cell by cell). Door `public.udt_set_table_row_actions(table, jsonb)` (`migrations/udt_table_row_actions.sql`, applied + ledgered 2026-09-21 18:01 UTC; shape-checked: ≤ 24 actions, ≤ 60 steps, ids unique, names ≤ 80 chars, every step's column exists and is not computed, `set` ∈ value/clear/formula, a formula step has an expression, an agent action has a prompt; editor access) via `service.setTableRowActions`. UI: Table settings → **Actions** tab (`components/RowActionsEditor.tsx`: list with the tinted chip + a plain-English sentence from `describeRowAction` — `Sets Status to "AVAILABLE"; clears Total, Fable; calculates Reset date.`; the form previews the compiled patch on a real row, before → after, or the honest error; saved per action immediately, like colors and the row label); the grid's Actions cell renders ONE action as its tinted chip (one click) and two or more as a lightning-bolt menu; the row's right-click menu gains **Run action** (`grid-context-menu.ts`, gated like every write); the selection bar gains **Run action** over every selected row (`BulkRowActions.tsx`). Agent scope: `row_actions` (id, name, kind, plain-English description) declared in the manifest and emitted by `buildDataTablesScope` (mirror synced 2026-09-21). NOT yet: an `agent` action always opens the panel (no headless "run and write back" — that is the automation primitive); no per-view visibility of actions. Tests: `__tests__/row-actions.test.ts` (New Week compiles to the exact patch; formula steps see the pre-action row; computed refusal; blank date refusal; one op per row and stop-before-write; defensive read; validation; template capture; sentences; agent message). Review row `97371913-d3e0-4775-b731-0da6c46d0deb` — `ready_for_human` after an independent live pass on the local preview (2026-09-21 21:03 UTC: Actions tab, Set-to input + blank refusal, preview, save, lightning menu run + toast + Cmd-Z, right-click Run action, selection-bar run over two rows, agent action opened the panel and summarized the row, edit/remove, table restored). A first pass had found the Set-to input missing on plain columns and the submenu labels squeezed — fixed in `1c6ac84ac1` before the second pass.
- `2026-09-21` — **Row label (Airtable's "primary field", Notion's title): the value that names a row wherever it is referred to.** Arman: "a way to say that when rows in a specific table are referenced, by default this is the value we want to show … allow a calculated field, first plus a space plus last." Model: `features/data-tables/row-label.ts` — `metadata.row_label = { kind: "field", field } | { kind: "formula", expression }` (the formula language), `readRowLabel`, `effectiveRowLabel` (unset → the first ordinary column: not computed, not a blob; a deleted label column falls back the same way), `rowLabelText` (never throws; a field label reads through the column's format; a merged label is the formula's text), `rowLabelOrFallback` ("Row 4f2a9c11" when empty). Door `public.udt_set_table_row_label(table, jsonb)` (`migrations/udt_table_row_label.sql`, applied + ledgered 2026-09-21 15:21 UTC; shape-checked: the field must exist, the expression must be non-empty ≤ 2000 chars; editor access) via `service.setTableRowLabel`. Consumers: the grid header shows a key marker on the label column and its header menu offers "Use as row label"; Table settings → Table tab has the **Row label** picker (`components/RowLabelPicker.tsx`: a column, or "Combine columns…" with the formula editor and a live example from the first loaded row; saved immediately, like colors); the right-click menu's "Row · …" heading and the delete confirmation (`Delete "China — Beijing"?`) name the row by it; the row-ordering dialog labels rows by it, merged labels included (the independent reviewer found the dialog still re-deriving a single column and fixed it in `512f5d6df7` — THE RULE that follows: a consumer that names a row calls `rowLabelText`, never its own resolver; census 2026-09-21 found and converted the last two); row references carry `row_label` so a pasted reference reads `Row "Emily Parson" from Contacts` instead of a UUID (`tableReferences.ts`, `TableReferenceModal.tsx`); `dataTableRowLabel` accepts the config; the row-ordering dialog defaults its label column to it. Agent scope (2026-09-21, later the same day): `row_label_rule` (`Column "Capital"` or the merge expression) and `current_row_label` are declared in the manifest and emitted by `buildDataTablesScope`; the intro tells the agent to name rows by it, never by id. The coming link-to-table column is its main consumer. Tests: `__tests__/row-label.test.ts`. Live-verified 2026-09-21 on the local preview by three independent passes (marker, header action, merged label with SQL-confirmed config, reference `row_label`, right-click heading, row ordering, delete confirmation from both entry points).


- `2026-09-21` — **Person columns.** See `lib/field-formats/FEATURE.md` (2026-09-21, `person`). The grid provides the table-owning organization's members once (`PersonChoicesProvider` around the viewer body; `usePersonChoicesFor(tableInfo.organization_id)` into `useFieldChoiceMap`), and the row forms' `ChoiceInput` reads the same provider. The header filter's checklist shows the label (name) and filters by the value (`ColumnHeaderMenu.labelForValue`, fed from `choiceMap` for any choice column whose labels differ from its values); the agent scope gains `column_list[].choice_labels` (value → label, present only when they differ — a write still sends the value). Known limit: no avatar in the chip yet. NOT yet seen in a browser.


- `2026-09-21` — **Drag a header to reorder; a summary bar under the grid.** (1) Header drag (desktop): `draggable` on every header, drop indicator on the left/right half of the target, writes the same per-view `order` the Columns picker writes (`resolveViewColumns` keeps the ordering logic in one place); the resize handle cancels its own mousedown so a drag can only start from the header body. (2) Summary bar: `features/data-tables/column-summaries.ts` (pure: sum / avg / min / max / median for number columns, count / filled / empty / unique for all; formatted through the column's own format so a currency sum reads as currency; a column with no numbers says so instead of showing 0) + `components/ColumnSummaryCell.tsx` (the footer cell: quiet "Summarize" affordance → list). Per-view `summaries` (URL `agg=budget:sum,status:filled`, saved-view `summaries`, `isViewCustomized`, described as "summary bar"). THE HONESTY RULE: computed over the rows the browser holds (full cache when filtering, else the page) and labelled "· page" with an explanation when that is not the whole table. Desktop only. Tests: `__tests__/column-summaries.test.ts` + the view-state suites. Verified live 2026-09-21 on host s8c805e69.localhost against the test table (`dd073d8c-f6cd-419e-8a81-7ce17cf50b81`): dragging the Capital header onto Country's left half moved it first (`ord=capital,country,…`, the Columns picker showed the same order), dropping on a header's right half landed it after that column instead; Summarize → Sum on a number-typed column showed "SUM 55,029,158" and `agg=area_sq_km:sum` in the URL, Unique on Continent showed the correct distinct count (4), None cleared the `agg` param; a saved view kept its summary across a reload and its description read "summary bar" (view deleted after); the honesty marker was confirmed both ways — the 8-row read-only Project Tracker example showed a plain "Sum of Story points: 240" with no page marker, while a 120-row owned table ("Grid Parity Fixture") showed "SUM · page $86,030.00" (sum of 20 numbers, this page only).


- `2026-09-21` — **The document page rendered NOTHING in dark mode, and the reason was inside Univer's fillStyle setter.** Cold walk 19 re-measured the screen the entry below fixed and found it worse: a 1396x684 canvas, **0.00% non-background pixels**, no paper, no margin marks, no cursor — and a real 519-character paragraph typed into it was **saved the whole time** (light mode, reloaded, showed it sitting on the page; the distiller drew 5 rules out of it) while the Expert could not see one word of it. Reproduced headless on production and again on localhost, in both themes, with a canvas pixel histogram: dark = 100% `rgba(0,0,0,0)`, i.e. the draw never ran; light = 66.85% painted. Root cause, in `@univerjs/engine-render` 0.25.1: **every `ctx.fillStyle = <string>` on Univer's rendering context goes through `ICanvasColorService.getRenderColor()`**, and in dark mode that method (a) INVERTS the colour — which is why the entry below's white paper came out black in cold walk 18 — and (b) calls `new ColorKit(color)` on anything that is not hex/rgb/rgba. ColorKit's `hslToColor` splits on COMMAS and **throws** on the space-separated `hsl(240 4% 16%)` form this app's tokens are written in; the throw is raised inside the render pass, so the ENTIRE draw aborts and every later frame throws again (flipping back to light never brought the page back). Three changes, all in `features/data-tables/`: **`univer-doc-canvas-colors.ts`** (new) swaps `ICanvasColorService` for Univer's own `DumbCanvasColorService` on the document instance via `injector.replace`, before the document unit exists — the only arrangement in which the decision below (paper + BLACK ink in both themes) is reachable, since inverting the paper inverts the ink with it; **`univer-doc-surface-theme.ts`** resolves `--background`/`--border` to `rgb(r, g, b)` instead of passing `hsl(h s% l%)` through, and `univerDocSurfaceViolations` now rejects any colour outside the grammar EVERY reader accepts; and **`hooks/useUniverDocSurfaceTheme.ts`** makes the host's palette the DEFAULT by wrapping `DocBackground.setFillColors` once — `DocRenderController._syncCanvasBackground()` re-pins the canvas element to `#fafafa` and calls `setFillColors(undefined × 4)` on **every keystroke**, so stating the colours once turned the page white the moment anybody typed. Guard: `pnpm check:univer-doc-theme` now also requires `renderDocumentCanvasColorsVerbatim` at every document boot site and drives Univer's **real** `ColorKit` and `invertColorByMatrix` over both themes' colours (`:self-test` plants both cold walks' editors AND both cold walks' colours); proven failing against this tree with each half reverted, passing with them. Tests: `__tests__/univer-doc-surface-survives-univer.test.ts`. Verified on a real screen at 1680x1020 as `admin@admin.com`: dark = 33.4% paper `rgb(245,245,247)` inside 30.2% frame `rgb(39,39,42)` with black ink; light unchanged; a live light→dark→light flip repaints both ways; and a sentence typed into a dark `fix19-` document appears as it is typed.
- `2026-09-21` — **The document page's own colours are the HOST's job — Univer has no theme.** Cold walk 18 (production, dark) opened a Rulebook's "Add more → New document" and measured the editing surface at `rgb(0, 0, 0)` inside a frame still painting `rgb(250, 250, 250)`: a black sheet in a white frame. Root cause: `@univerjs/docs-ui` contains **zero** references to `darkMode` or the theme service, `@univerjs/engine-render`'s `DocBackground` paints the desk and the paper from four module-level LIGHT constants (`DOCS_WORKSPACE_FILL_COLOR = "#fafafa"`, `PAGE_FILL_COLOR = white`, …), and `DocsRenderService` pins the canvas ELEMENT's background to `#fafafa` once at create time. `univerAPI.toggleDarkMode()` (`useUniverDarkModeSync`) recolours Univer's CHROME and stops there — so a host that says nothing does not get "the default", it gets whatever Univer happens to hold, in whatever theme. `DocumentEditor` now also consumes **`hooks/useUniverDocSurfaceTheme.ts`**, which resolves the four fills plus the canvas background from `app/globals.css` tokens (`univer-doc-surface-theme.ts`) and writes them through `DocBackground.setFillColors` on boot and on every theme flip, announcing loudly when it cannot reach the render. The decision, recorded there: **the page is paper in BOTH themes and the frame follows the app** — Univer's ink is black and lives in the document's own runs, so a dark page would be black-on-black (the same defect, moved). Guards: `pnpm check:univer-doc-theme` (+ `:self-test`) refuses a `createUniver` + `UniverDocsCorePreset` mount that does not consume the hook (proven failing against this tree with the hook removed, passing with it), the invariant suite `__tests__/univer-doc-surface-theme.test.ts` records that Univer's own upstream defaults VIOLATE the invariant in dark mode and that an unparseable fill — which a 2D context renders as opaque black — is a violation and never a pass, and `__tests__/univer-doc-surface-apply.test.ts` proves the colours actually reach the canvas element and all four fills. Both embedding surfaces (`/documents/[id]` and the canvas pane's `DocumentCanvasBody`) mount this one editor, so both inherit it.

- `2026-09-21` — **Layout defaults are the ORGANIZATION's; the view only overrides.** Three knobs (`migrations/udt_layout_default_knobs.sql`, applied + ledgered 03:19 UTC; `platform.knob_resolve` verified live → `"auto"`, `8`): `extensibility.user_tables.default_layout` (auto | fit | scroll), `.fit_max_columns` (2–30, replaces the `FIXED_LAYOUT_MAX_COLUMNS = 8` literal, which is gone), `.default_row_height`. Read per TABLE-OWNING organization by `hooks/useTableLayoutDefaults.ts` (seeded values render until the knobs answer; a failed read is logged and the seeded values stay). The view's `layout` / `density` gained a fourth value, **`default`** = "whatever my organization set" (`TableLayoutChoice`, `TableRowDensityChoice`, `effectiveLayoutMode`, `effectiveRowDensity`): absent from the URL and from `isViewCustomized`, while an EXPLICIT `lay=auto` / `den=normal` is a real personal choice — the only way to pick Automatic inside an organization whose default is Scroll. Picking the organization's own value in the Layout menu clears the override rather than pinning it. A saved view stored before this with `layout: "auto"` keeps meaning explicit Automatic. Tests updated in the three view-state suites. Verified live 2026-09-21 on host s8c805e69.localhost against the test table (`dd073d8c-f6cd-419e-8a81-7ce17cf50b81`, org `884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f`): `platform.knob_resolve('extensibility','user_tables.fit_max_columns', org)` answered `8` and the Layout menu read "Fits up to 8 columns"; a temporary `platform.knob_override` row (organization scope, value `3`) flipped `knob_resolve` to `3` and, after reload, the menu read "Fits up to 3 columns" with the grid in natural-widths/scroll mode (`table-auto w-max`, not the fit-stretched class) for the 6 visible columns; picking the org's own value (Automatic) in the Layout menu left `lay` out of the URL while picking Fit to width added `lay=fit`; the override row was deleted afterward and `knob_resolve` was reconfirmed live at `8`.


- `2026-09-21` — **No door can write a computed cell (closes the handoff's "udt_upsert_cell still accepts a write into a formula column").** Fixed at the one place every door passes — the row trigger — instead of one RPC at a time: `workbench.udt_assign_autonumbers()` now also runs `BEFORE UPDATE OF data` (trigger `_udt_computed_on_update`). For `formula` / `created_time` / `modified_time` columns an INSERT stores nothing and an UPDATE keeps exactly what the cell held before; an `autonumber` column keeps its assigned number (a row with none yet may receive one — the backfill). Migrations `udt_computed_columns_are_never_written.sql` then `udt_computed_columns_keep_hidden_values.sql` (both applied + ledgered 2026-09-21 03:17 UTC). The second corrects the first 40 minutes later: the first REMOVED the key on update, which would have silently erased the old values of a text column later turned into a formula — values `setFieldFormat` promises are hidden, not gone. Proven by rolled-back transactions on the live test table: caller-typed Autonumber → 1, next → 2, three-row bulk → 3,4,5; update to 999 stays 1; a legacy row's hidden `Europe/Asia` survives an overwrite attempt while its other cell edits normally; a new row stores nothing in a formula column.


- `2026-09-21` — **Autonumber columns.** Migration `migrations/udt_autonumber_column.sql` (applied + ledgered 2026-09-21 03:10 UTC, checksum `2ca86cd1…`; verified live: trigger enabled, `authenticated` may call the door, `anon` may not, nobody but the owner may call the trigger function): BEFORE INSERT trigger `_udt_autonumber` on `workbench.udt_dataset_rows` writes `1 + the highest number ever stored` for every Autonumber column of the row's table — soft-deleted rows included, per-field advisory lock, a caller-supplied value overwritten, consecutive across a multi-row insert. Documented limit: HARD-deleting the highest-numbered row frees that one number (no separate high-water mark, because updating the field row per insert would fire its version triggers). Door `public.udt_backfill_autonumber(table, field)` numbers pre-existing rows oldest-first, editor access required, idempotent; `service.setFieldFormat` calls it whenever the format becomes `autonumber` and reports a failure instead of leaving a half-numbered column. `isAutonumberColumn` joins `isComputedColumn`, so the grid cell, paste / clear / fill, the row forms and the agent `cell_value` target all refuse it. Verified live 2026-09-21 on host s8c805e69.localhost:3001 against the test table (`dd073d8c-f6cd-419e-8a81-7ce17cf50b81`): adding an Integer column with Shows as → Autonumber numbered all 6 existing rows 1–6 oldest-first (confirmed against `created_at` via SQL), the grid cell and the Add Row form both refused it with the read-only note, and — proven with direct inserts/deletes against the same trigger after the Add Row dialog's country combobox proved too flaky to drive reliably in this session's remote browser — a new row got N+1, soft-deleting the highest-numbered row kept its number reserved (the next insert still got N+1), and hard-deleting the highest-numbered row freed it (the next insert reused that number), matching the documented behavior exactly.


- `2026-09-21` — **System columns (Created time, Last modified time) and Wrap text.** `formulas.ts` gains `systemColumnKindOf` + `isComputedColumn` (formula OR system) — THE refusal check for every write path (grid cell, paste / clear / fill, row forms, new-column form's default/required, agent `cell_value`); `withComputedColumns` injects the row's `created_at` / `updated_at` BEFORE formulas run, so `YEAR({Added})` works, and leaves the cell blank when a reader returned no timestamp. Its `formulaFieldNames` set now holds every computed column (named for its first tenant). Sorting/filtering a system column follows the formula rules (client-side when the browser holds every row). **Wrap text** is the fifth Layout option (`wrap=1`, saved-view `wrap`): whole cell text on as many lines as it needs, and a multi-line cell shows every line instead of the first + "+N more lines". Tests: `computed-columns.test.ts` (system block), `table-layout-state.test.ts`. Verified live 2026-09-21 on host s8c805e69.localhost:3001 against the test table (`dd073d8c-f6cd-419e-8a81-7ce17cf50b81`): Created time and Last modified time columns showed a date-time on every existing row, offered no default/required in the new-column form, refused direct typing/double-click in the grid, and showed the read-only note in Edit Row; sorting by Created time was chronological; editing another cell in a row advanced that row's Last modified time (confirmed at the DB level, `updated_at` moved forward). Wrap text: turning it on showed a 252-character sentence and a 3-line cell in full with no "…" or "+N more lines" and added `wrap=1` to the URL; turning it off restored the single line / "+N more lines" truncation and dropped the param.


- `2026-09-20` — **Layout is part of the view: fit-to-width vs natural widths, dragged column widths, row height, frozen first column; and the `time` format.** Arman: "make the column widths adjustable … an option in the UI to make your table full width or to have it scroll … we do some things by default but allow the user to override it." Model (`table-view-url.ts`): `layout: auto | fit | scroll` (`auto` = the platform default over `FIXED_LAYOUT_MAX_COLUMNS`; `resolveTableLayout`), `widths: Record<field, px>` (clamped 60–1200, `parseColumnWidths`/`serializeColumnWidths`, URL `w=budget:220,notes:96`), `density: compact | normal | tall`, `freezeFirst`. All four ride the URL (`lay`, `w`, `den`, `frz`), the saved-view definition (a pre-layout definition opens with defaults; a stored width is clamped, never trusted), `isViewCustomized`, and `describeDefinition`. UI: the **Layout** menu beside Columns (`components/TableLayoutMenu.tsx`), a drag handle on every header's right edge (paints the width during the drag, commits on mouse-up; double-click resets; not on mobile), and a dragged width replaces the 150px floor. Freeze pins the first visible column at `left-10` beside the checkbox column. `time` format: see `lib/field-formats/FEATURE.md`. Tests: `__tests__/table-layout-state.test.ts` + the two view-state suites. Verified live 2026-09-21 on host s8c805e69.localhost:3001: Layout menu (Automatic/Fit to width/Natural widths, Row height, Freeze first column) opens beside Columns and drives `lay`/`den`/`frz` correctly (`lay` leaves the URL on Automatic); dragging a header's right edge widened Area (sq km) from 280px to 400px live and committed `w=area_sq_km:400` on mouse-up, persisted across reload, and double-clicking the handle reset it and dropped `w`; Compact/Tall visibly changed row height (45px/77px) with `den=compact`/`den=tall`; Freeze first column set `frz=1` and pinned Country at `left-10` beside the checkbox column after adding temp columns forced horizontal scroll (verified via `scrollLeft`); a saved view with the dragged width + Tall + frozen restored all three on reopen and its `title` read "natural widths · column widths · tall rows · first column frozen"; the `time` format round-tripped (native `<input type="time">` in both the grid and Edit Row, locale display "2:30 PM", chronological sort with nulls first) and the test "Opens at" column was deleted afterward; the read-only Project Tracker example (27 columns) showed the same Layout menu, drag handles were present even though read-only, and `lay=fit` applied correctly. No code changes were needed.


- `2026-09-20` — **The grid fills its panel at any column count; add-row and add-column live everywhere columns and rows are managed.** (1) Layout: past `FIXED_LAYOUT_MAX_COLUMNS` the table was `w-auto min-w-max`, so showing a ninth column snapped the grid from full width to content width and left the right of the screen blank (Arman: "only loads part of the UI", Coding Accounts, nine columns). Now `w-max min-w-full`: natural widths, never narrower than the panel. (2) THE DOORS CENSUS — every place a user manages rows/columns offers the add: toolbar (+ Column, + Row — existing), right-click (Add row, Insert column left/right — existing), the "+" at the end of the header row (add column at end — new), the "Add row" line under the last row and "Add the first row" in the empty state (new), the column header menu (Insert column left / right, Hide column — new; was sort/filter/rename/settings/remove only), Table settings → Fields & Order ("Add column", replaced by "Save or cancel your changes to add a column" while edits are unsaved, because adding reloads the list — new), and the Columns view picker ("Add a column to the table…" — new). All are absent on read-only tables. `tsc` clean, data-tables tests green. Verified live 2026-09-20 on host s8c805e69.localhost:3001: the Project Tracker example (27 columns) filled its panel edge-to-edge (`table.getBoundingClientRect().width` 4247.9px against its `overflow-auto` container's `clientWidth` 1858px, `scrollWidth` 4248px) and scrolled sideways; on the read-only Project Tracker, the "+" add-column, add-row, header-menu insert/hide, Table settings, and Columns-picker add-column controls were all absent; on the editable test table, the "+" opened Add New Column, "Add row" opened Add New Row, the column header menu offered Insert column left/right and Hide column (hid and restored Country via the Columns picker), Table settings → Fields & Order showed "Add column" and switched to "Save or cancel your changes to add a column" mid-edit, and the Columns picker ended with "Add a column to the table…"; adding three temporary columns (raising the test table to 9 data columns) kept the table filling the panel exactly (both 1858px) before the columns were removed again.

- `2026-09-17` — **The document editor stops losing the last thing you typed, and stops swallowing saves in silence.** Cold walk 8 typed several paragraphs into a brand-new document reached from a Masterwork Rulebook and found a blank page after a reload; that document has ZERO rows in `udt_document_snapshots`, so not one save was ever attempted. Two causes. (1) Autosave fired 2.5s after the last keystroke **and at no other moment**, so every reload, tab close and client-side route change inside that window dropped what had just been typed, silently. `DocumentEditor` now flushes the pending debounce on `pagehide`, on `visibilitychange` → hidden, and in the boot effect's cleanup (fired BEFORE the facade is nulled, since `performSave` takes its snapshot synchronously before its first `await`), and registers a `beforeunload` that warns when work is still unwritten — a flush is a request, not a guarantee. (2) `performSave` had two bare early returns, hit when the Univer facade or the active document was missing: they swallowed autosave AND the toolbar button while the page still said "Editing" and accepted keystrokes, which is indistinguishable from the walk's report. Both now call `announceUnsaveable`, which sets the error status and names the only remedy that saves the person's words (copy them out, then reload to reconnect). Boy-scout in the same file: the save-state pill no longer hides itself below `sm` — save state is the one thing on that bar a person must be able to trust — and no longer wears a hardcoded `border-green-500` while saying "Unsaved changes" in amber. Verified live: typed into a new document and reloaded 0.9s later, well inside the debounce; the `origin=autosave` row landed and the sentence was on screen after the reload. Guarded from the masterwork side by `features/masterwork/sitting/textEntrySurfaces.ts`, whose `door` row names this module and fails if the listeners go away.

- `2026-09-17` — **The table list is ordered by most recent activity (Arman: "sort tables by the most recently updated as the default… it might be using the creation date").** It was: `get_user_tables` ordered by `created_at`. A dataset's own `updated_at` moves only on rename / settings, never on a cell or column edit, so the function now computes `last_activity_at` = newest of the dataset's, its rows' and its columns' stamps, orders by it (newest first) and returns it; the `/data` cards and list rows show that same date. Every reader of the RPC (pickers, Quick Data, save/append dialogs) inherits the order. Migration `migrations/udt_get_user_tables_orders_by_last_activity.sql` (based-on verified, applied + ledgered `2026-09-17 17:11:40+00`, checksum `7dce2d3e…`). Verified live: called as admin@admin.com, the July-created test table edited today came back first; `/data` shows it first with "Updated: Sep 17, 2026". Additive shape, `jsonb` return — no `db-types` change.

- `2026-09-17` — **Long cell text no longer paints over the next column.** Past `FIXED_LAYOUT_MAX_COLUMNS` the table is `table-auto`, where `max-w-0` capped the column but not the content's paint. The body `<td>` now clips, and `lib/field-formats/FormattedFieldValue` gives a value asked to `truncate` an inline-block box (plain and markdown branches) so it ends in "…" with the full text as its tooltip. Verified live on the Project Tracker example.

- `2026-09-17` — **Right-click reads by target; columns rename in place (Arman, testing the menu himself).** (1) The grid marks the clicked target's section `primary` (`features/context-menu-v3` § THE PRIMARY SECTION): a header click opens on `Column · <name>`, a cell on `Cell · <name>` → `Row ·` → `Column ·` → `Table · <table>`, the row checkbox/actions on `Row ·`; a group with no target is not offered (`gridMenuTargetKind` in `UserTableViewer`). (2) **Rename column** is the first row of the Column section and of the header ▾ menu: the header label becomes an input in place (Enter / blur saves, Escape cancels, a duplicate name is refused and the input stays open). `renameColumn` (`service.ts`) writes `display_name` only — `field_name` never changes, so rows, filters, colors and saved views are untouched — then `rewriteFormulasForRename` rewrites `{Old}` → `{New}` in every formula that named it (`rewriteFormulaReferences` in `formulas.ts`, string-literal aware, 4 tests). Table Settings calls the same rewrite after its own save, so neither path can turn a formula into `#ERROR`. Live-verified on the local preview as admin@admin.com: header menu order; `Capital` → `Capital city` saved and reloaded; `Area (sq km)` → `Area km2` kept `Double area` computing with the toast "Updated the formula in Double area"; both restored. Live-found and fixed: the closing menu hands focus back to its trigger AFTER the input mounts, which blurred and cancelled the rename — the input takes focus back for the first 700 ms. NOT verified: the rename from the header ▾ popover (same handler), the Table Settings rewrite path in a browser, mobile.

- `2026-09-15` — **Formula columns: one read-side helper, off-grid refusals, header controls, showcase column.** See § Formula columns in the grid (top paragraph). Commits `26f41a5e8c`, `968b3f08f1`, `315c4dd761`. Verified live on the local preview (list in that section); 286 data-tables tests green; `tsc --noEmit` clean for every touched file. Surface mirror re-synced (`POST /api/admin/surfaces/sync-manifests` → 200) and `pnpm check:surface-drift` OK. Project Tracker example reseeded with `--only project-tracker --reset` (new id `30374c26-f16d-4e78-ab12-01495f86b954`). Filed five review-queue rows (lane `data-tables-grid-overhaul`) and dispatched an independent reviewer. NOT done: aidream ORM regeneration is a no-op for the two new SQL functions (`db/generate.py` emits table models only; nothing in aidream reads `udt_*` functions).

- `2026-09-14` — **Formula columns rendered, validation rules wired into the grid.** Verified live on `/data/[id]`: a `maxLength: 12` rule on Capital rendered "Washington, D.C." amber with the tooltip "Must be at most 12 characters (this is 16) — this value was saved before the rule, and is kept."; typing a 22-character value into that cell and committing raised "Must be at most 12 characters" and kept the editor open with the typed text, and Escape restored "Beijing". Formula rendering has unit coverage only until a column carries the format — the expression editor is the next step.

- `2026-09-14` — **DD-244: the grid's live data-loss path is closed.** A column type change no longer empties a cell without keeping the value, and row history is no longer trimmed below Arman's ruled 30-day floor. Migration `migrations/dd244_udt_history_reason_and_retention_floor.sql` (applied + ledgered `2026-09-15 03:57:51+00`, checksum `051bc808…`): new `workbench.udt_dataset_row_versions.reason`; `udt_log_row_version` stamps it from the transaction-local `matrx.udt_version_reason`; new `udt_cast_jsonb_value` is the ONE cast rule; `udt_change_field_type` counts un-castable values, stamps `type_change:<from>→<to>`, PROVES the history landed (and raises, rolling back, if it did not) and returns `values_moved_to_history` + `history_reason`; new knob `extensibility.user_tables.history_retention_floor_days` (30 days, `raise_only`, organization-overridable); `udt_dataset_row_versions_trim_scoped` reads it per organization and the cron's zero-arg wrapper delegates (cron job 13 untouched). UI: `TableConfigModal` says the count and names Restore as the way back (and its pre-change confirm no longer claims values just "become null"); `VersionHistoryViewer` badges that version "Column type changed (string→integer)". Guard `pnpm check:udt-history` / `:self-test` (`scripts/check-udt-history-honesty.ts`) — proven RED on the pre-fix bodies (`column "reason" does not exist`), GREEN on all five checks after. Verified: the live functions by SELECT; a lowering override refused live (`must be >= 30`); `pnpm db-types` regenerated; `pnpm check:parse` + `tsc --noEmit` clean for every touched file. NOT verified by me: the live browser dialog on production (a separate verifier owns that), and the weekly cron's next real run.

- `2026-09-14` — **Column validation rules.** See § Validation rules. New: `features/data-tables/validation.ts` (the ONE rule model), `features/data-tables/components/ColumnValidationEditor.tsx` (the Rules popover on each Table Settings column card), `migrations/udt_validation_rules_strict_enforcement.sql` (new pure helper `public.udt_validate_cell_rules`; `public.udt_validate_row` consults it under strict mode only). Enforced client-side in `EditableCell`, `AddRowModal`, `EditRowModal` and the agent `cell_value` write target regardless of `validation_mode`; existing violating values render in the format system's existing amber. Verified: `npx jest features/data-tables/__tests__/validation.test.ts` 39/39 green; the migration's in-transaction DO block 26/26 (it cannot apply otherwise); applied and ledgered at `2026-09-15 03:46:40+00`, checksum `10db619e…`; `public.udt_validate_cell_rules` called live as the `authenticated` role returned `Must be at most 100` / `Must be one of: Red, Blue` / `null` for an empty value; `npx tsc --noEmit -p tsconfig.typecheck.json` clean for every touched file. NOT verified: the live browser — the grid, the row modals and the Rules popover were not exercised on `/data/[id]`, and the strict-mode trigger has not been tripped by a real row write. NOT wired (the viewer is owned by another session this turn): `UserTableViewer` still has to pass `validationRules` / `existingValues` to `EditableCell`, `validationRules` to `FormattedFieldValue`, and `validationRules` on each `surfaceFields` entry — until it does, the grid cell, the amber and the agent's `column_list.validation` are inert. The `EditRowModal`, `AddRowModal`, agent `cell_value`, Table Settings and database paths are complete.

- `2026-09-14` — **Range selection (cells / rows / columns), live colors, wide-table layout.** See § Range selection. Verified live: shift-click made a 3-cell range and Cmd-C wrote "Beijing\nOttawa\nBrasília"; a drag selected a 2×4 block with no text selection; clicking the Capital header selected the column and copied 6 lines; right-click inside the range showed "Cells · 6 selected"; an SQL change to `metadata.style` on the open table repainted the rows within a second with no reload. Wide tables (over eight visible columns) now keep natural column widths and scroll sideways instead of overlapping text (the 26-column example was unreadable). The org lane fix that unblocked the example seed is in `migrations/iam_org_access_platform_admins_manage_global_system_org.sql`. NOT verified in the isolated browser: a real second user's session for the live-color path (the SQL update stood in for it).

- `2026-09-14` — **Colors (color-by / rules / highlights), Examples section, menu additions.** See the three sections above. Verified live on `/data/[id]`: "Color rows by this column" on Country tinted every row (palette fallback for colorless options); "Highlight cell → Amber" wrote `style.cells` and painted the cell while selected; the Colors dialog opened with the live color-by and an empty rule list. Migration applied and ledgered; `pnpm db-types` regenerated. The example tables are seeded (see § Examples); realtime for style changes is still open.

- `2026-09-14` — **Copy / cut / paste on a selected cell (spreadsheet blocks included), choice cells select-then-open, and the grid's first right-click menu.** See § Grid clipboard + right-click menu. Verified live on `/data/[id]` in the isolated browser: Cmd-C on a plain and on a choice cell wrote the cell text; a native paste event over a cell wrote it and Cmd-Z restored it; a two-row block on the last row raised the "Add 1 new row?" confirm, Skip wrote the fitting cell; the menu opened with the Cell / Row / Column sections and no INERT / VALUE MAPPING scream. Not verifiable in the isolated browser (it denies clipboard read and fires no native clipboard events): the Cmd-V async fallback was proven with a stubbed `readText`; the real-browser prompt path is untested.

- `2026-09-13` — **Data's ambient assistant no longer shrinks list pages or covers the full-height table editor.** The route wrapper is padding-free and clipped; `/data` and `/data/create` now own their runway on the actual scrolling leaf. The launcher is exact-route limited so `/data/[id]` preserves its grid and pagination viewport. A forcing source-contract test locks the ownership and route boundary.

- `2026-09-11` — **Every user-data-table RPC guard now asks the grant the RLS
  policy asks, instead of re-implementing it.** On a table shared read-only the
  page rendered all 400 rows while every copy action — `getCompleteTable` →
  `get_user_table_complete`, the loader behind Copy table / Copy JSON / Current
  table view / the copy-subset window / the JSON and CSV exports — was refused
  with `viewer access required for dataset …` (feedback `5c31eaea`). The RPC's
  SECURITY DEFINER guard admitted only service_role, the row's own `user_id`,
  and an explicit `iam.permissions` grant; the `std_select` policy on
  `workbench.udt_datasets` additionally admits platform admins, `created_by`,
  public visibility, org admins, org members at ≥ internal, and every conveyed
  lane through `iam.has_access`. **A guard stricter than the row policy over the
  same rows is the defect** (db-rules §6). All 11 guards in the family now call
  one helper, `workbench.udt_dataset_access(table, level)`, which mirrors
  `std_select` at viewer and `std_update` at editor —
  `migrations/udt_rpc_guards_match_row_policy.sql`, which carries a DB-side
  equivalence assertion and will not apply without it. Two siblings closed in the
  same pass: the editor guards refused platform and org admins for the same
  reason, and `udt_bulk_write` / `udt_change_field_type` / `udt_upsert_cell` /
  `udt_upsert_row` still called `has_permission('workbench.udt_datasets', …)` —
  a bare table name is not a permission key, so a non-owner editor got a raised
  P0001 rather than a decision (`udt_permission_token_fix.sql` had repointed only
  the unprefixed spelling). No frontend behaviour changed; the frontend half of
  the contract is pinned by
  `features/data-tables/__tests__/complete-table-read-grant.test.ts` — a refusal
  must arrive as a FAILURE, never as a confidently empty table.

- `2026-09-10` — Fixed the clipped Table Settings footer and exposed universal dataset sharing from settings, desktop toolbar, and mobile actions; removed the separate table-public checkbox and write path.

- `2026-08-29` — **Table detail uses one compact mobile control row and content-driven columns.**
  Search and one overflow target now occupy the only persistent chrome row; sort defaults,
  saved views, per-view columns/reset, and table actions reuse the existing bottom sheet. The
  phone grid uses bounded `table-auto` columns with horizontal scrolling instead of dividing
  the viewport equally across every visible field; desktop keeps its fixed, stable grid. Mobile
  pagination shows only the current page between tap-sized previous/next controls.
- `2026-08-25` — **URL-backed table filters no longer crash with React #185.** The shared
  `useMirroredUrlState` now reads the live query string when applying URL changes, so its
  state-to-URL effect cannot be undone by the stale query snapshot from the same render. A
  forcing hook test covers the `/data/[id]` sorted-and-filtered transition.
- `2026-08-24` — **Edit Row mobile actions no longer collide.** The row-actions trigger is a
  tap-sized, labeled control, and the canonical `DialogHeader` now reserves the shared close
  target's hit area for every dialog that becomes a mobile bottom sheet.
- `2026-08-22` — Added canonical AppShell top clearance to the workbook gallery so the first row of workbook cards and actions no longer collides with the transparent shell header.
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

## Realtime

Realtime moved onto `@ai-matrx/realtime` (2026-09-07). `SupabaseYjsProvider` is a broadcast ROOM on the package (its `client` option became `manager`, since the package's ref-counted room registry is exactly what that option worked around), and it gained the decoupled ordered handler queue — which matters most here, because it ships 200KB base64 frames whose bursts used to run back-to-back on the socket callback path. A CRDT is not exempt from "realtime has no replay": `onBackfill` re-sends `y-request-state`, the same thing a new joiner does. The snapshot hooks re-read the newest snapshot on recovery so a client cannot checkpoint on a base that moved while it slept.
