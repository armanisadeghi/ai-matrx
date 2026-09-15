---
type: Handoff
status: active
updated: 2026-09-15
repos: [matrx-frontend]
scope: program
feature: Data Tables
vision: []
---

# Data Tables — grid interaction, colors, validations, formulas

**What this is:** finishing the user-data-table grid at `/data/[id]` so it behaves like a real spreadsheet (selection, clipboard, right-click), carries meaning through color, refuses bad values, and computes formula columns — plus the read-only example tables every user sees.
**Scope:** Program (one part of the Data Tables feature: the typed-dataset grid; Workbooks are untouched)
**Feature:** Data Tables (`features/data-tables/FEATURE.md`)
**Vision:** VISION MISSING — Arman has written no vision doc for this; his rulings exist only as chat, quoted verbatim below.

## Vision — Arman's words (chat, 2026-09-14)

- On coloring: *"I want to do what the best do and just do it better not get crazy with features."* — the Airtable line (color by a column, rules, manual highlights), not the Excel canvas.
- On what the table must offer: *"being able to add a column or a row by right-clicking. It makes sense to be able to add a column to the right or left and to be able to add a row. It just feels natural."* and *"multi-select cells … row and column selection … for communicating with an agent, that is almost often a very, very useful thing."*
- On the examples: *"we create a few system tables that demonstrate to users how our table system can be used … these could then be defaults that they can see, which are read-only."*
- On the system organization: *"we had purposely set it up so that that organization has no users and should never have users … if something's requiring it to have a user before it can store things, then that's the problem we need to fix."*
- On order of the rest: validations → formulas → automations through the existing scheduling and workflow primitives (he approved the recommendation; automations must never be built inside data-tables).

## Resources

- Feature doc: `features/data-tables/FEATURE.md` — sections *Grid clipboard + right-click menu*, *Colors*, *Examples*, *Range selection*, *Formula columns in the grid*, *Validation rules in the grid* (each with its live-verification record).
- The grid: `components/user-generated-table-data/UserTableViewer.tsx` (one 4k-line component; every mount of it — route, windows, pickers, overlays — gets everything below).
- Selection + clipboard: `features/data-tables/grid-selection.ts` (pure, tested), `hooks/useGridSelection.ts`, `grid-clipboard.ts` (TSV, `planPaste`).
- Right-click: `features/data-tables/grid-context-menu.ts` (registered in `features/context-menu-v3/SECTIONS.md`); skill `context-menu-v3`.
- Colors: `features/data-tables/table-style.ts` (model), `components/ColorRulesDialog.tsx`, DB door `public.udt_set_table_style` (migration `migrations/udt_table_style_and_example_tables.sql`).
- Validations: `features/data-tables/validation.ts`, `components/ColumnValidationEditor.tsx`, migration `migrations/udt_validation_rules_strict_enforcement.sql` (`public.udt_validate_cell_rules`).
- Formulas: `features/data-tables/formulas.ts` (language, 65 tests), `formula` format in `lib/field-formats/registry.ts`, `components/FormulaExpressionEditor.tsx`.
- Examples: `scripts/seed-udt-example-tables.ts` (`--reset`, `--only`), `public.udt_list_example_tables`; the access fix that lets a super admin create system-owned rows: `migrations/iam_org_access_platform_admins_manage_global_system_org.sql` (doctrine note in common-docs `systems/platform/db-rules/FEATURE.md` §6e).
- Surface: `features/surfaces/manifests/data-tables.manifest.ts` + `features/data-tables/agent-context/buildDataTablesScope.ts` (`selected_range_tsv`, `selected_rows_json`, `column_list[].validation`). Mirror sync = `POST /api/admin/surfaces/sync-manifests` from a super-admin browser session.
- Testing: `pnpm preview:start` → your own hostname; `pnpm dev-login /data/<id>`; test table "Table 1 · 2nd" `dd073d8c-f6cd-419e-8a81-7ce17cf50b81` (owned by admin@admin.com); examples `ce73458f…` (Project Tracker), `437ad3e2…` (Product Catalog), `6a4b2950…` (Team Directory). Trap: the isolated browser denies clipboard read and fires no native clipboard events — dispatch a synthetic `paste` `ClipboardEvent` and stub `readText` (memory `inapp-browser-clipboard-limits`). Trap: the harness "Return" key does not reach the grid as Enter — dispatch a `keydown` with `key: "Enter"` from JS. Tests: `npx jest features/data-tables/__tests__ --no-coverage` (277).

## Remaining work

1. **Formula values are missing from every server-fed export.** The grid injects computed values only into the rows it renders. Copy table / Copy JSON / Copy for AI / CSV and JSON export / the copy-subset window all read the full table through `getCompleteTable()` → formula columns come out EMPTY there. Fix at the read layer: apply the same `formulaColumns` injection (`UserTableViewer.tsx`, the block after `displayRows` derivation) inside `features/data-tables/table-copy.ts` / `TableCopyControls.tsx` and the export modal — ideally one shared `withComputedColumns(rows, fields)` helper in `features/data-tables/formulas.ts` that the viewer also calls. Same gap for `full_table_json` in the agent scope (`buildDataTablesScope.ts`, `fullDataset`).
2. **Formula columns are still writable off-grid.** `EditableCell` refuses, but the row forms (`AddRowModal.tsx`, `EditRowModal.tsx`) render an input for a formula column, and the agent `cell_value` target (`hooks/useDataTableWriteHandlers.ts`) accepts a write into one. Hide/read-only the field in the forms; throw a plain reason in the write handler (the handler already throws for uncoercible values — same pattern). Consider `udt_upsert_cell` refusing at the DB when the field's `metadata.format.id = 'formula'` (a new `-- based-on:` replace of that function).
3. **Live-verify the formula editor and one rendered formula column.** Never exercised in a browser: the preview slot was held by other checkouts when it landed. Open any table → Settings → set a column's "Shows as" to Formula → the expression button appears under the picker; write `{Area (sq km)} * 2` on the test table; confirm values render, `#ERROR` on a bad reference, and that copy/paste skip the column. Also the new-column form path.
4. **Give the Project Tracker example a formula column** (`scripts/seed-udt-example-tables.ts` — e.g. `Budget per point = {Budget} / {Story points}` with result format currency) and rerun with `--only project-tracker --reset`, so the showcase shows formulas. Depends on 3 passing.
5. **Re-sync the surface mirror.** The validations build changed the `column_list` description after the last sync; run the sync from an admin session and confirm `pnpm check:surface-drift`.
6. **Header controls on a formula column.** Sort and the column filter still appear on a formula header although the server never sees the computed value (facets/sort RPCs read stored data). Either compute client-side over the loaded rows or disable those two controls with the reason, per THE CONSISTENCY STEP.
7. **File the review-queue rows.** None of this UI was reviewed by an agent that did not build it (`agent-review-queue` skill): colors dialog, range selection, formula editor, validation editor, Examples section.
8. **Automations** (Arman: through the platform's scheduling/workflow primitives, never inside data-tables). `features/scheduling/types.ts` declares an `"event"` trigger type but `TriggerConfig` has no event shape and nothing produces table-change events. Design the producer (a `platform.activity_log` row per `udt_dataset_rows` change or a realtime-driven scheduler claim) and the trigger config there; the table side then only needs "run agent X when a row changes" as a knob.
9. **Realtime colors with a real second user.** Verified by changing `metadata.style` under an open page; not by a second signed-in session. Two-browser check per the `supabase-realtime` skill checklist.
10. **Real-browser clipboard prompt path.** The Cmd-V fallback (`navigator.clipboard.readText`) shows a one-time permission prompt in Chrome and a Paste button in Safari; untested outside the isolated browser.
11. **"N values don't fit" on the Table Settings column card** was deliberately not built: `udt_table_profile` returns `top_values`, not every value, so any count from it would be wrong. Needs a column-scan RPC or a client pass over the full cache.
12. **aidream ORM types** were not regenerated for the two new SQL functions (`udt_set_table_style`, `udt_list_example_tables`); functions only, no table shape changed — run aidream's `generate.py` when next touching that side.

## Done

- Copy / cut / paste on a selected cell, block paste from Excel/Sheets, choice cell select-then-open — `grid-clipboard.ts`, `useGridSelection.ts`.
- The grid's v3 right-click menu (cell / row / column / dataset sections, add row, insert column left/right, highlights, color-by) — `grid-context-menu.ts`.
- Colors: color by a column, rules, manual highlights, live for other viewers — `table-style.ts`, `ColorRulesDialog.tsx`, `udt_set_table_style`.
- Range selection (shift-click, drag, keyboard, row, column, all) with range copy/clear/fill/paste-fill; agents get `selected_range_tsv` + `selected_rows_json` — `grid-selection.ts`, viewer.
- Example tables seeded in the system org and listed under Examples on `/data`; the org lane admits super admins on the global system org — `seed-udt-example-tables.ts`, `iam_org_access_platform_admins_manage_global_system_org.sql`.
- Wide tables (over eight visible columns) scroll instead of overlapping — viewer `FIXED_LAYOUT_MAX_COLUMNS`.
- Validation rules: model, Table Settings editor, cell/form/agent/paste refusal, amber for stored violations, strict-mode trigger — `validation.ts`, `udt_validation_rules_strict_enforcement.sql`.
- Formula language + `formula` format + grid rendering (read-only, `#ERROR`) + expression editor — `formulas.ts`, `FormulaExpressionEditor.tsx`.

## Decisions needed

None that lack a best-practice answer. Item 8 (automations) is a design job with a clear direction, not a ruling.
