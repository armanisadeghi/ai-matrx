---
type: Handoff
status: active
updated: 2026-09-20
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

**2026-09-20 additions (Arman: "add more data types … make the column widths adjustable … full width or scroll … look for other things just like that"):**

0a. **More column types** — `time` shipped 2026-09-20; **created time / last modified time** shipped 2026-09-21 (no migration needed — both readers already return the timestamps); **autonumber**, **address** and **progress bar** shipped 2026-09-21. Still missing against the Airtable field list, in the order people will ask: **created time / last modified time** (system columns fed from the row's own timestamps the way formulas are injected — `withComputedColumns`-style, read-only), **person** SHIPPED 2026-09-21 as a choice column fed by the organization's members (name chip, no avatar yet; filter facets and agent `choices` still show ids), **attachment** (file ids from the files feature; the grid renders thumbnails via `enhance-file-type` slots), **autonumber** (server-assigned sequence on insert — a trigger, not a client counter), **link to another table + lookup/rollup** (the Reference system exists for single links; lookups are formulas over the linked row), **barcode / QR**, **button** (run an agent on this row — belongs to automations, item 1 below). Each is one `FieldFormatDef` plus its input; the system-fed ones also need the row's `created_at`/`updated_at` returned by `get_user_table_data_paginated` (check) and `get_user_table_complete`.
0b. ~~**Layout defaults as an organization knob.**~~ SHIPPED 2026-09-21 (three knobs + `default` view state; the 150px column floor is still a literal). Original note: Today `auto` (fit ≤ 8 columns, else scroll) is hardcoded taste; per the settings law it should be a `platform.feature_knob` (`extensibility.user_tables.default_layout`, values auto/fit/scroll, plus default row height) with the per-view choice as the override. Same for the 150px column floor.
0c. ~~**Wrap text** per view~~ SHIPPED 2026-09-21 (Layout menu, `wrap=1`). Original note: (Airtable "wrap"): cells currently truncate with an ellipsis; a `wrap` view flag that turns off `truncate` and lets rows grow is the natural fourth control in the Layout menu.
0d. **Drag-to-reorder headers and the summary bar** shipped 2026-09-21 (not yet seen in a browser). **Column widths on touch devices.** The drag handle is desktop-only; the Layout menu could offer per-column width presets (S/M/L) for phones.
0e. **Live verification of the layout + time work** (commit `c9bb3c545f`): not yet seen in a browser at the time of this note — see the FEATURE.md change log for the checklist (fit/scroll switch, drag + double-click, density, freeze, Time column create/edit/sort, saved view round-trip).

1. **Automations** (Arman: through the platform's scheduling/workflow primitives, never inside data-tables). `features/scheduling/types.ts` declares an `"event"` trigger type but `TriggerConfig` has no event shape and nothing produces table-change events. Design the producer (a `platform.activity_log` row per `udt_dataset_rows` change or a realtime-driven scheduler claim) and the trigger config there; the table side then only needs "run agent X when a row changes" as a knob.
2. **Realtime colors with a real second user.** Verified by changing `metadata.style` under an open page; not by a second signed-in session. Two-browser check per the `supabase-realtime` skill checklist.
3. **Real-browser clipboard prompt path.** The Cmd-V fallback (`navigator.clipboard.readText`) shows a one-time permission prompt in Chrome and a Paste button in Safari; untested outside the isolated browser.
4. **"N values don't fit" on the Table Settings column card** was deliberately not built: `udt_table_profile` returns `top_values`, not every value, so any count from it would be wrong. Needs a column-scan RPC or a client pass over the full cache.
5. ~~**`udt_upsert_cell` still accepts a write into a formula column at the DB.**~~ CLOSED 2026-09-21 at the row trigger, for every door at once (see FEATURE.md change log). Original note: Every client path refuses (grid cell, row forms, paste/fill, agent `cell_value`), but a raw RPC call can store a value nobody will ever see (the column is recomputed on read). A `-- based-on:` replace of that function refusing when the field's `metadata.format.id = 'formula'` closes the door for good.
6. **Review-queue rows** (lane `data-tables-grid-overhaul`, filed 2026-09-15). Independent pass done the same day: range selection `bdbf522f-e90a-4696-a12c-e221b1c42aca`, formulas `b81aed22-1168-46e4-b8c7-ebae9a84b12d` and validation `5ebb9039-608b-4e89-b25a-2ec065011049` are `ready_for_human` (the reviewer fixed three defects on the way: a highlighted cell dropped out of a selected range, row forms refused silently on an off-screen rule, a computed cell refused silently — `dd042e1f74`, `d57755de08`, `c7e524a94e`). Colors `f9043790-1016-4b81-9b98-b7f369607f44` came back (instruction asked for a numeric rule on a text column), was corrected and is `ready_for_human` after a second pass. Examples `61f4814f-638e-4f60-bc32-0eac8dba8c58` came back (editable by the seeding admin), was repaired in `700aa289e5`; the second reviewer found and fixed three more holes — the examples also listed under "My Tables" with edit/delete, the cell double-click refused silently, the right-click menu told the owner to "ask the owner" — in `dbb21c7738` and `5d3469766c`, then correctly parked the row for a verifier who wrote none of it; a third, uninvolved verifier re-ran the instructions and promoted it — all five rows are `ready_for_human` as of 2026-09-15. Presentation note for Arman (not a defect): for the account that owns them the three examples also appear under "My Tables" (read-only there too); a normal user sees them only under Examples. Whoever picks this up: `select id,status,feedback from agent.review_queue where metadata->'origin'->>'agent_label'='data-tables-grid-overhaul'`; a row left at `submitted` is unfinished work. Not verified by anyone yet: that a NON-owner sees the examples read-only (only the admin identity was available; the code path is the same `isReadOnly`).
7. ~~**Copy → Text writes the literal word `null` for empty cells**~~ FIXED in `@ai-matrx/kit` 0.16.1 (2026-09-21, `content-transfer` `textValue`: null → ""; guard test proven failing-then-passing; tag `npm/kit/v0.16.1` pushed). Adopted here the same session (lockfile → 0.16.1; `check:matrx-packages` green). Original note: in the TSV (seen live 2026-09-15 on the test table's empty row). Not a formula defect; belongs to `@ai-matrx/design-system/content-transfer`'s text format (THE SAME-SESSION LAW: fix in the package).
8. ~~**Long cell text paints over the next column**~~ — FIXED 2026-09-17: the body cell clips (`overflow-hidden`) and `FormattedFieldValue` gives a truncating plain/markdown value a box so it ends in "…"; verified live on the Project Tracker example (Summary, Notes).
9. **Dev-preview observation, not a product defect as far as known:** on the shared preview the route `/data/[id]` once fired hundreds of `?_rsc=` refetches (`ERR_INSUFFICIENT_RESOURCES`) around a Fast Refresh rebuild and fell back to a full navigation, losing an open dialog. Seen once; if it recurs on production it is a real bug (a `router.refresh`/prefetch loop).

10. **Header right-click: what a spreadsheet user still expects** (independent reviewer, 2026-09-17, after the rename + menu-order work passed review as `fa5d2ad7-371f-4f62-9f01-70b3568bb2fd`): Freeze column, Duplicate column, Move column left/right, Resize / auto-fit width, Clear column contents, and Filter in the right-click menu (today it lives only in the header's small arrow menu). Each delegates to a handler the grid must already have or gain once — no new write path in `grid-context-menu.ts`.

11. **Example tables wear a "Your organization" badge on `/data`** for the account that owns them (seen 2026-09-17). They belong to the platform's system organization; the badge should say so (or be absent) rather than claim the viewer's org.

## Done

- Copy / cut / paste on a selected cell, block paste from Excel/Sheets, choice cell select-then-open — `grid-clipboard.ts`, `useGridSelection.ts`.
- The grid's v3 right-click menu (cell / row / column / dataset sections, add row, insert column left/right, highlights, color-by) — `grid-context-menu.ts`.
- Colors: color by a column, rules, manual highlights, live for other viewers — `table-style.ts`, `ColorRulesDialog.tsx`, `udt_set_table_style`.
- Range selection (shift-click, drag, keyboard, row, column, all) with range copy/clear/fill/paste-fill; agents get `selected_range_tsv` + `selected_rows_json` — `grid-selection.ts`, viewer.
- Example tables seeded in the system org and listed under Examples on `/data`; the org lane admits super admins on the global system org — `seed-udt-example-tables.ts`, `iam_org_access_platform_admins_manage_global_system_org.sql`.
- Wide tables (over eight visible columns) scroll instead of overlapping — viewer `FIXED_LAYOUT_MAX_COLUMNS`.
- Validation rules: model, Table Settings editor, cell/form/agent/paste refusal, amber for stored violations, strict-mode trigger — `validation.ts`, `udt_validation_rules_strict_enforcement.sql`.
- Formula language + `formula` format + grid rendering (read-only, `#ERROR`) + expression editor — `formulas.ts`, `FormulaExpressionEditor.tsx`.
- **2026-09-17:** the `/data` list (and every table picker) is ordered by most recent ACTIVITY — table, rows or columns, whichever is newest — instead of creation date; the card shows that date. `get_user_tables` replaced via `migrations/udt_get_user_tables_orders_by_last_activity.sql`, verified live.
- **2026-09-17 (Arman testing the right-click himself):** header right-click opens on the column's own actions with **Rename column** first (inline rename in the header, formulas that name the column are rewritten, Table Settings shares the rewrite); the menu is ordered by what was clicked (Cell → Row → Column → Table, dead groups not offered) through a new shared v3 primitive, `primary` sections. Not yet independently reviewed — file a review-queue row if this grows further.
- **2026-09-15 (after review):** formula editor names an unknown `{reference}` instead of "Valid"; example tables read-only for everyone in the UI, including the seeding admin; three reviewer fixes listed under item 6.
- **2026-09-15:** formula values in every server-fed reader (copy / export / agent scope / filter / client sort) through ONE helper `withComputedColumns`; formula columns refused off-grid (row forms, new-column form, agent `cell_value`); header sort/filter on a formula column honest (client-side or refused with the reason); a row saved without the referenced cell is BLANK not `#ERROR` (live-found, guarded); Project Tracker example carries `Budget per point = {Budget} / {Story points}` as currency (reseeded; new id `30374c26-f16d-4e78-ab12-01495f86b954` — the ids in Resources above for the other two examples are unchanged); formula editor + rendered column + sort + Edit Row + Copy verified live on the local preview; surface mirror re-synced and `check:surface-drift` OK; aidream ORM regen confirmed a no-op (table models only). Test table now also carries a `Double area` formula column (kept as the live example).

## Decisions needed

None that lack a best-practice answer. Item 8 (automations) is a design job with a clear direction, not a ruling.
