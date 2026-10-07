# FEATURE.md — `data-tables` (user tables, the Sheet)

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/data/custom-data/STATE.md — read it before touching this feature in ANY repo.

**Status:** `live`
**Tier:** `1`
**Last updated:** `2026-10-01`

---

## Where a table lives — the data seam

**Every user table lives in the record store (`custom.*`).** The older `workbench` store is gone
from the code; nothing here reads or writes it.

- **`service.ts` is the one door.** Every export takes the table's id, finds the table's own
  organization (`data-source/locate-table.ts` → `features/unified-data/whereThisTableLives.ts` →
  `custom.where_id_opens`), remembers it (`data-source/table-home.ts`) and answers through
  `data-source/record-store.ts` (`@ai-matrx/records`). A table the store does not hold for this
  person, or a store that could not be asked, is a failure in words — never an empty grid.
- **A new table is born in the store** (`createTable` → `data-source/where-a-table-is-born.ts`):
  the organization is the caller's (`ensureOrgId` holds the request when there is none); no knob
  is read.
- **Never call a store door from a component.** Call the seam; a UI edit and an agent edit take one
  path. `pnpm check:old-system-unreachable` goes red on any reader of the removed doors.
- **The grid's shapes** (`Dataset`, `DatasetField`, `DatasetRow`, `RowVersion` in `types.ts`) are
  built by `data-source/record-store-shape.ts` from the store's Fields and documents.
- **Routes:** `/data` and `/data/create` redirect to `/data`; `/data/<id>` mounts the table
  page (`app/(core)/data/[tableId]/page.tsx`), the same screen as `/data/<id>`.
- **Hosts outside the table page** open a table by id through `components/LocatedTableViewer.tsx`
  (records-ui's table page via `records-ui-host/recordsUiHost.tsx`). The **Sheet** layout
  (`components/SheetLayout.tsx` → `components/user-generated-table-data/UserTableViewer.tsx`) is the
  classic grid as one layout of that page.

## Column shape — THE COLUMN KNOWS ITSELF

**Never count distinct values in the browser over a partial set.** `getColumnFacets` (one column)
and `getTableProfile` (every column, one round trip) answer "what is actually in this column"
from the store, over every row.

🚨 **LOCAL DATA FIRST — the store is the FALLBACK.** When the browser already holds every row the
facets describe, they are computed in memory (`computeColumnFacets`, `column-filters.ts`). Ask the
store ONLY when `localRows` does not cover `totalCount` (`localFacetsAreComplete`) — counts from a
partial set look authoritative and are wrong.

Refusals are meaningful: a field name that is not a column is refused (never an empty list, which
reads as "the column is empty"). The `looks_*` fields on a profile are **counts, not verdicts**.

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

## Workbooks and documents — moved out

Univer workbooks and documents are their own features since 2026-10-07 (domain tree: content >
workbooks, content > documents): `features/workbooks/FEATURE.md`, `features/documents/FEATURE.md`;
the shared Univer runtime is `lib/univer/`, the Yjs collab provider `lib/collab/`. Guard:
`__tests__/univer-documents-and-workbooks-live-outside-data-tables.test.ts`.

## The grid interaction model — three states, and THE CLICK LAW

`@ai-matrx/design-system/data-table/grid-selection` is the source of truth (this repo's fork was deleted 2026-09-25); read it before
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
read-only table. A second write path is always the one that corrupts something. Its stack (depth, the redo contract) is the design-system's pure
`@ai-matrx/design-system/data-table/cell-undo`; the hook owns only the write, the toast and the labels.

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
the column's `field_order`, which is the table's shared default and
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
a block from the selected cell downward and rightward, in ONE `bulkWrite`,
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
The menu carries `surfaceName` only on the table page's Sheet (inside another
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

**Where it lives.** The table's `metadata.style` — one blob per table, read with the
table's own metadata (`getTableMetadata` → `tableInfo.metadata`, zero extra requests),
written by PATH through the seam's `setTableStyle(path, value)` (the store translates it to
its decorations; a null value deletes the key and prunes empty parents).
Surgical paths are what let two editors highlight different cells without clobbering
each other. Model, parsing, precedence and class maps: `@ai-matrx/design-system/data-table/table-style`
(this repo's consumer tests in `__tests__/table-style.test.ts`). The grid patches its local copy optimistically
and adopts the server's returned style on success. Copy, export, the agent scope and the
row data never see colors. Realtime does NOT yet push style changes to other viewers
(the viewer subscribes to rows only) — a reload shows them.

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
(Excel-paste-ready), Delete or cut clears every cell in ONE `bulkWrite` with each
cell on the undo stack, pasting ONE value over a range FILLS it, a block still lands at
the anchor, and **Cmd-D / "Fill down"** copies the range's first row down. Right-click
inside the range keeps it and the Cell section becomes "Cells · N selected" (cut / clear /
paste over / fill down / highlight N cells). The ticked-checkbox rows are a separate
model (bulk actions) and stay that way. **Agents see both:** `selected_range_tsv` (+
`selected_range_cell_count`, a header line of machine field names first) and
`selected_rows_json` on the `matrx-user/data-tables` surface — "these cells" / "these
rows" now mean something to an agent.

**Live colors.** `useRecordStoreTableRealtime` answers the store's "the shape moved" signal
with a fresh metadata read, so a rename, a description or a color change by another editor
lands without a reload.

## Validation rules — what a column ACCEPTS (2026-09-14)

Three questions can be asked of a column, and the Table Settings card now asks
all three in one row: what it **Stores** (the storage type), what it **Shows as**
(the display format), and what its **Rules** accept.

The rules live on the column's `validation_rules` (jsonb; the store keeps them as the
Field's rules, translated by `record-store-shape.ts`). The model,
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
| Store | the record store judges every write by the column's rules | always (a store table is strict by construction) |

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
the seam's `updateTableConfig` carries `validation_rules`, and `{}` is the only way to
CLEAR rules; `serializeValidationRules({})` returns exactly that.

**Agents can see the rules.** `column_list` entries gain `validation?: string[]`
— the same plain-English phrases the row forms print (`describeValidationRules`)
— so an agent reads the rule instead of discovering it by being refused.

**Not built (said plainly).** The Table Settings card does NOT show "N values
don't fit". The table profile returns `top_values`, not every value, so a
count derived from it would be a confident number over a partial set — the exact
failure § Column shape exists to prevent. A real count needs its own RPC and is
not in this pass.

## Formula columns in the grid (2026-09-14; readers unified 2026-09-15)

**THE ONE INJECTION POINT (2026-09-15):** `withComputedColumns(rows, fields)` in
`@ai-matrx/design-system/formulas` (with `formulaColumnsOf` / `isFormulaColumn`) is the only place a
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
26 functions in `@ai-matrx/design-system/formulas`, tested there) STORES nothing. `UserTableViewer`
computes it at render for every displayed row (`{Display Name}` or `{field_name}` references,
earlier formula columns visible to later ones) and injects the value into the row it renders,
so display, copy, the agent scope and client-side sort all see the same number. A bad
reference or a division by zero renders `#ERROR` with the reason as its tooltip. The cell is
read-only (double-click, Enter, typing and the agent's `cell_value` all refuse), and paste /
clear / fill down skip formula cells and say so. A formula column sorts in the browser
(`storeSorts` in `UserTableViewer`) — the store's page sort does not order by it.
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

## Realtime

The Sheet listens through `useRecordStoreTableRealtime` (the store's broadcast port,
`createRecordsRealtimePort` from `@ai-matrx/records/realtime`, bound once per organization in `records-ui-host/recordsUiHost.tsx`): record ids come down the wire and are
re-read through the store's id door; "the shape moved" triggers a metadata read. This browser's
own writes never arrive (every write carries an op id the port drops). Workbook collab rides
`@ai-matrx/realtime` (`SupabaseYjsProvider` as a broadcast room; `collab/FEATURE.md`).

## Change log

- `2026-10-03` — claude (document black-page lane): **A document page was solid black from first boot, in every browser and theme.** After the Univer 1.0 upgrade (2026-09-23) the editor's `DumbCanvasColorService` handed Univer's theme tokens (`"gray.0"`) straight to `ctx.fillStyle`; a canvas ignores an unparseable colour and keeps its default black. Replaced with a token-resolving, non-inverting service; the surface-theme hook now calls `getRenderUnitById` (the 0.x `getRenderById` silently returned nothing, so no host colour ever landed); a pageless document's workspace takes the page colour so ink stays legible in dark mode. Not caused by 08a47eaf1d (kept-instance re-parenting). Guards: `check:univer-doc-theme` rules D/E (self-test plants the dumb service and the 0.x lookup), `univer-theme-token-color.test.ts`, `univer-doc-surface-apply.test.ts` (pageless case). Browser (clone): canvas readback light and dark is paper with ink, no theme warning.
- `2026-10-03` — claude (remount-safety lane): **A cloud document is one working copy per tab; editors are views.** `document-model/documentModels.ts` defines the `udt_document` kind of THE platform working copy (`lib/working-copy`): status, dirty, views and the record's row/edit gate in Redux `workingCopies["udt_document:<id>"]`, one coalesced save, the `DocumentModel` engine (Univer body) registered beside it. Local mutations replay into every other view of the document; a new view boots from the model's latest state, never a stale server copy; the snapshot channel, the Yjs room and the page-hide flush open once per document; the document stays warm 5 min after its last view (snapshot channel open), so a woken / remounted board tile reads and writes nothing. A save happens only when the content differs from the saved version's fingerprint (an untouched document is never written). `useDocumentRealtime` and the `documentSessions` slice are deleted. Guards: `__tests__/one-document-many-views.test.tsx` (2/2 red on the old code), Board remount harness `udt_document` + `:quiet`. Browser (clone): typed in a board tile, it slept (zoomed out 12 s), one snapshot write, woke with the text and zero document requests.
- `2026-10-03` — claude (lane I, grids review 3, the Sheet): a date & time is stored as an absolute
  instant (`date-cell-words.ts`, the one reader for the calendar, a key typed before it opened, a
  paste and a default; a time typed alone keeps the cell's day); every number look reads through
  `readCellWord` (`(150)` is −150 in Money, in a cell, a paste, bulk set and the row forms via
  `row-form-words.ts`); "+ Row" and the Add row line make the row in the grid with its first cell
  editing and hand over keys typed meanwhile (`hooks/useInlineNewRow.ts`); the row form focuses its
  first field and its voice/menu buttons leave the tab order; Add Column waits with the reason beside
  the button (`column-still-needs.ts`); Space ticks a selected tick box, a digit rates; the choice list
  ranks by `@ai-matrx/records` `typedMatchScore`; a deleted row is one step on the one undo stack
  (`useCellUndo.recordStep`). Phone still shows as typed: the shared `formatPhone` is not exported by
  `@ai-matrx/records-ui` yet.
- `2026-10-01` — claude (lane OLD-READERS-REMOVAL FE-SEAM): the seam lost its older store. Every
  export answers from the record store; `/data` and `/data/create` redirect to `/data`,
  `/data/<id>` mounts the table page; the older `/data` home, its modals, `useTableRealtime`,
  `tableLivesIn`, the both-stores de-dupe and `utils/user-table-utls` (folded into this folder:
  `table-shapes.ts`, `grid-import.ts`, `type-inference.ts`, `template-utils.ts`) are gone. The
  history of the older store is in git.
