# FEATURE.md — `workbooks` (Univer spreadsheets)

Domain tree: content > workbooks. Split out of `features/data-tables` on 2026-10-07; routes
`/workbooks` and `/workbooks/[id]` are unchanged. Documents (the Univer doc editor) are the sibling
feature `features/documents`; both share `lib/univer/` (theme, facade, dispose, snapshot-mutation
helpers) and `lib/collab/` (Yjs over Supabase Broadcast). `features/data-tables/export-targets.ts`
still builds the workbook a table is exported into.

## History (moved from data-tables)

Workbooks (`udt_workbooks`, lossless spreadsheets in Univer) and documents (`udt_documents`) are a
separate live surface (`workbook-service.ts`, `document-service.ts`, `/workbooks`, `/documents`).

- ✅ `udt_workbook_snapshots` table — append-only content store keyed by `workbook_id`; RLS mirrors `udt_workbooks`; viewers see all snapshots they can view the parent of; editors can append; in `supabase_realtime` publication.
- ✅ `workbook-service.ts` — `createWorkbook` / `listAccessibleWorkbooks` / `getWorkbook` / `renameWorkbook` / `deleteWorkbook` / `getLatestSnapshot` / `saveSnapshot` / `listSnapshots`.
- ✅ `useWorkbookRealtime` hook — Postgres-Changes subscription for `udt_workbook_snapshots` filtered by `workbook_id`.
- ✅ `WorkbookEditor` component — mounts Univer (`@univerjs/presets` + `@univerjs/preset-sheets-core`), hydrates from latest snapshot, debounces autosave (2.5s after last edit), hot-swaps on remote snapshots from other users; ignores echo of own writes. Status pill shows idle / dirty / saving / saved / error. Toolbar buttons: "Save now" (labeled snapshot, bypasses autosave) and "History" (opens snapshot timeline).
- **Dependency alignment (2026-09-23):** keep `@univerjs/core`, `@univerjs/themes`, `@univerjs/presets`, `@univerjs/preset-docs-core`, and `@univerjs/preset-sheets-core` together at `1.0.0` in the manifest and lockfile. The document editor and Markdown converter require the 1.0 paragraph/section ID and document-save APIs. Frozen install, full type check, and production build pass with the aligned cohort; this replaces the earlier 0.25.1 hold against partial core/themes upgrades.
- **Document canvas colours (Univer 1.0).** Univer paints its own fills as theme TOKENS (`"gray.0"` page, `"gray.100"` desk, `"gray.900"` ink). `renderDocumentCanvasColorsVerbatim` installs a colour service that resolves tokens from the live theme (`univer-theme-token-color.ts`) and inverts nothing — never `DumbCanvasColorService`, which passes `"gray.0"` to the canvas, where it is ignored and the page stays default black. `useUniverDocSurfaceTheme` finds the render through `getRenderUnitById` (1.0's name), and a pageless (modern) document's workspace takes the page colour, since its text sits on that fill. Guard: `pnpm check:univer-doc-theme` (+ `:self-test`) scans the shipped engine-render / docs-ui bundles for every token and drives the real `ThemeService` and `ColorKit`.
- **Verifying the document canvas headless.** A screenshot of a Univer canvas in headless Chromium is real rendering (CPU raster; old and new headless agree). Read the pixels directly: in the page, `document.getElementById("univer-doc-main-canvas").getContext("2d").getImageData(0, 0, w, h)` — a healthy page is mostly the paper colour with a few hundred distinct antialiased ink colours; `0,0,0,255` over most of the canvas is the black page, and a console line `[document] theme not applied to the page surface` means the host colours never landed. Capture the page with CDP `Page.captureScreenshot`; remove `nextjs-portal` first if another lane's build error overlay covers it.
- ✅ Routes — `/workbooks` (list + create + delete + **import XLSX/CSV**), `/workbooks/[id]` (open + rename + edit). Editor is dynamically imported with `ssr:false` so Univer never runs server-side.
- ✅ **XLSX/CSV import** — `xlsxToUniverWorkbook` (SheetJS-based) converts uploaded files to a minimal `IWorkbookData`: values + types + formula source for all sheets, ISO dates for date cells. Pre-flight parse so a malformed file does not leave an empty workbook husk. The original file id will plug into `udt_workbooks.original_file_id` once the universal file handler linkage is wired.
- ✅ **Snapshot history viewer + restore** — `WorkbookHistoryViewer` lists snapshots newest-first with origin badges (autosave / manual / imported / restored); Restore writes a NEW snapshot from the chosen one so the realtime hook hot-swaps automatically. Snapshots are append-only; restoring does not delete history.
- ✅ **Export workbook → XLSX** — `univerSnapshotToXlsxBuffer` + `downloadUniverAsXlsx` (SheetJS). Symmetric to the import path; same scope (values + types + formula source per sheet). Wired as a toolbar button in `WorkbookEditor`; filename = workbook name.
- ✅ **Share + permission gating** — `udt_workbooks` added to client-side `SHAREABLE_RESOURCE_REGISTRY` (DB registry had it from P1). `/workbooks/[id]` header gets the standard `<ShareButton>`. Page calls `has_permission(udt_workbooks, id, 'editor')` at mount to decide whether the editor mounts in editable or viewer-only mode (owner always edits; shared editors detected via the RPC; everyone else sees viewer mode).
- ✅ **V2 — full CRDT collab is LIVE.** Yjs over Supabase Broadcast via the public `onMutationExecutedForCollab` hook; `collab` flag ON at `/workbooks/[id]`. Verified by `lib/collab/verify-collab.ts` (10/10, incl. real-Broadcast e2e). See `collab/FEATURE.md` — run the verify gate before touching the provider/session.

**P5 — operational hardening (decided 2026-06-06):**
- ✅ **aidream attribution — honest NULL.** Decided to keep `changed_by = NULL` for service_role / pool writes (no JWT). The audit trail honestly reports "system write" rather than misattributing to row owners. No code change required on aidream's side.
- ✅ **`udt_workbooks.original_file_id` FK live.** `REFERENCES cld_files(id) ON DELETE SET NULL`. Workbook import path now uploads the source file via `fileHandler.upload(...)` first and stores the `cld_files.id` on the workbook row. Upload failure is non-fatal — workbook still imports without the link.
- ✅ **Smart importer (P3).** `smart-importer.ts` routes an upload by 7 weighted signals (`ImportRouteDialog`, auto-route at `confidence > 0.6`). Its typed route reads the first sheet (`readImportGrid`) and opens the ONE "Save to a table" (`saveToTable` overlay → records-ui `SaveToTable`), which makes the table in the record store or adds the rows to an existing one.

**Workbook collab v2 — ✅ DONE (2026-06-12):**
- ✅ Implemented, verified (`collab/verify-collab.ts` 10/10 incl. real-Broadcast e2e), and flag flipped ON at `/workbooks/[id]`. Architecture + the three bugs the verify gate caught are documented in `collab/FEATURE.md`.
- ⏳ v2.1 polish (optional): pixel-positioned cursor rings over the actual cell (currently a toolbar presence strip); repurpose `useWorkbookRealtime` to log-only.
