# FEATURE.md — `data-tables` (user tables: the seam to the record store, and the table page)

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/data/custom-data/STATE.md — read it before touching this feature in ANY repo.

**Status:** `live`
**Tier:** `1`
**Last updated:** `2026-10-07`

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
  page (`app/(core)/data/[tableId]/page.tsx`).
- **The table page is the store grid, drawn by `@ai-matrx/records-ui`.**
  `records-ui-host/recordsUiHost.tsx` binds the host ports once; the grid, board, calendar,
  gallery, cell editor, row forms, column menu, saved views, clipboard and undo all live in that
  package (its CHANGELOG is the record). Hosts outside the page open a table by id through
  `components/LocatedTableViewer.tsx`, which mounts the same page; `pnpm check:one-store-grid`
  keeps every store-table host on it. `components/user-generated-table-data/ColumnHeaderMenu.tsx`
  is the one older component left (the CMS collection page uses it); it reaches data only
  through `service.ts`.

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
[`lib/field-formats/FEATURE.md`](../../lib/field-formats/FEATURE.md) § Choice. **Dependent
columns** narrow to the group named by another column's cell; a controller change never rewrites
the dependent cell — an off-list value goes amber and the person decides.

## Workbooks and documents — moved out

Univer workbooks and documents are their own features since 2026-10-07 (domain tree: content >
workbooks, content > documents): `features/workbooks/FEATURE.md`, `features/documents/FEATURE.md`;
the shared Univer runtime is `lib/univer/`, the Yjs collab provider `lib/collab/`. Guard:
`__tests__/univer-documents-and-workbooks-live-outside-data-tables.test.ts`.

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

| Path | What refusal looks like |
|---|---|
| Inline cell edit (records-ui) | The reason beside the cell; the editor STAYS OPEN holding what was typed (same as a server refusal) |
| Add row / Edit row (records-ui) | Inline red line under that field; the rules print under every field that has them |
| Agent write (`cell_value`) | THROWS the reason plus every rule the column carries, so the retry is informed |
| Store | The record store judges every write by the column's rules — always (a store table is strict by construction) |
Client enforcement is unconditional; the store is the backstop.

**The reason strings are the product.** `features/data-tables/validation.ts` words them: `Must be
at least 0`, `Must be at most 100`, `Must be at least 3 characters (this is 2)`, `Must match the
pattern ###-####`, `Must be one of: Red, Green, Blue`. Pinned by `__tests__/validation.test.ts`.

**`unique` is checked by the caller** against the rows it holds (`existingValues`), which catches
the common mistake honestly; the editor says so in as many words. A real guarantee would be a
unique expression index, not a trigger.

**Saving.** Rules ride the SAME write every other column property uses — the seam's
`updateTableConfig` carries `validation_rules`, and `{}` is the only way to CLEAR rules.

**Agents can see the rules.** `column_list` entries carry `validation?: string[]` — the same
plain-English phrases the row forms print (`describeValidationRules`) — so an agent reads the rule
instead of discovering it by being refused.

## Realtime

The table page listens through `useRecordStoreTableRealtime` (the store's broadcast port,
`createRecordsRealtimePort` from `@ai-matrx/records/realtime`, bound once per organization in `records-ui-host/recordsUiHost.tsx`): record ids come down the wire and are
re-read through the store's id door; "the shape moved" triggers a metadata read. This browser's
own writes never arrive (every write carries an op id the port drops). Workbook collab rides
`@ai-matrx/realtime` (`SupabaseYjsProvider` as a broadcast room; `collab/FEATURE.md`).

## Change log

- `2026-10-07`: Sheet retired; the table page is the store grid
- `2026-10-03` — claude (document black-page lane): **A document page was solid black from first boot, in every browser and theme.** After the Univer 1.0 upgrade (2026-09-23) the editor's `DumbCanvasColorService` handed Univer's theme tokens (`"gray.0"`) straight to `ctx.fillStyle`; a canvas ignores an unparseable colour and keeps its default black. Replaced with a token-resolving, non-inverting service; the surface-theme hook now calls `getRenderUnitById` (the 0.x `getRenderById` silently returned nothing, so no host colour ever landed); a pageless document's workspace takes the page colour so ink stays legible in dark mode. Not caused by 08a47eaf1d (kept-instance re-parenting). Guards: `check:univer-doc-theme` rules D/E (self-test plants the dumb service and the 0.x lookup), `univer-theme-token-color.test.ts`, `univer-doc-surface-apply.test.ts` (pageless case). Browser (clone): canvas readback light and dark is paper with ink, no theme warning.
- `2026-10-03` — claude (remount-safety lane): **A cloud document is one working copy per tab; editors are views.** `document-model/documentModels.ts` defines the `udt_document` kind of THE platform working copy (`lib/working-copy`): status, dirty, views and the record's row/edit gate in Redux `workingCopies["udt_document:<id>"]`, one coalesced save, the `DocumentModel` engine (Univer body) registered beside it. Local mutations replay into every other view of the document; a new view boots from the model's latest state, never a stale server copy; the snapshot channel, the Yjs room and the page-hide flush open once per document; the document stays warm 5 min after its last view (snapshot channel open), so a woken / remounted board tile reads and writes nothing. A save happens only when the content differs from the saved version's fingerprint (an untouched document is never written). `useDocumentRealtime` and the `documentSessions` slice are deleted. Guards: `__tests__/one-document-many-views.test.tsx` (2/2 red on the old code), Board remount harness `udt_document` + `:quiet`. Browser (clone): typed in a board tile, it slept (zoomed out 12 s), one snapshot write, woke with the text and zero document requests.
- `2026-10-01` — claude (lane OLD-READERS-REMOVAL FE-SEAM): the seam lost its older store. Every
  export answers from the record store; `/data` and `/data/create` redirect to `/data`,
  `/data/<id>` mounts the table page; the older `/data` home, its modals, `useTableRealtime`,
  `tableLivesIn`, the both-stores de-dupe and `utils/user-table-utls` (folded into this folder:
  `table-shapes.ts`, `grid-import.ts`, `type-inference.ts`, `template-utils.ts`) are gone. The
  history of the older store is in git.
