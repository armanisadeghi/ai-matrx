# Field Formats — semantic display types over plain storage types

**Status:** live · **Owner:** platform primitive (`lib/field-formats/`)

## What this is

A **format** is a UI-layer semantic type layered on a plain storage type.
`currency` is not a database type — it is a `number` the UI knows to show as
`$1,234.56`, edit with a currency-aware input, and right-align. Same for
`percent`, `email`, `url`, `rating`, `duration`, `tags`, `relative_time`.

The database stores exactly what it always stored. Strip the format and you are
back to the raw value, unchanged. That is what makes formats safe to add,
change, and remove at any time with no migration and no data rewrite.

## The two laws

**THE FALLBACK LAW.** A format may never blank a cell and never throws. When a
stored value cannot be interpreted under its declared format,
`formatFieldValue` returns `ok: false` **together with the base-type rendering
of that same value** and a human `reason`. `<FormattedFieldValue>` shows that
text in amber with the reason as a tooltip. A user who types `n/a` into a
Currency column sees `n/a` in amber — never an empty cell, never an error.
The same law governs editing: `FormatAwareInput` returns `null` when a format
has no opinion about its input, and the caller's storage-type input runs
unchanged. **A format may add a better rendering or input; it may never take a
working one away.**

**ONE REGISTRY.** Every format lives in `registry.ts`. Adding a row there gives
it to every consumer at once. A consumer with its own type vocabulary maps that
vocabulary onto `FieldFormatId` (see `context-value-types.ts`); it never forks a
second formatter table. Currency formatting existed in six places before this
module — do not make it seven.

## Files

| File | Role |
|---|---|
| `types.ts` | `FieldFormatId`, `FieldFormatDef`, `FieldFormatOptions`, `FormatResult` |
| `registry.ts` | THE registry — 22 formats, their `format()` / `parse()`, and `formatsForBase` / `defaultFormatForBase` |
| `format.ts` | `formatFieldValue`, `parseFieldInput`, `resolveFieldFormat`, `readFieldFormatConfig` — THE FALLBACK LAW lives here |
| `FormattedFieldValue.tsx` | The ONE read-only renderer (links, swatch, chips, stars, amber mismatch) |
| `FieldFormatPicker.tsx` | The ONE picker — format select + only the options that format reads |
| `context-value-types.ts` | Bridge from the scopes `ContextValueType` vocabulary |

## The formats

Text: `text` `long_text` `markdown` `email` `url` `phone` `color`
Numbers: `number` `decimal` `currency` `percent` `duration` `integer` `rating` `file_size`
Choice: `boolean`
Dates: `date` `datetime` `relative_time`
Structured: `json` `array` `tags`

Each declares a `base` storage type and optional `alsoAccepts`. The picker only
offers formats that can legally sit on the column's storage type, so a Currency
format can never end up on a boolean.

## Consumers

**User data tables (`/data/[id]` and every mount of `UserTableViewer`).**
Persisted at `workbench.udt_dataset_fields.metadata.format = {id, options}`.

- Write: `setFieldFormat()` in `features/data-tables/service.ts` → the
  `udt_set_field_format` RPC. **The only write path.** Passing `null` clears the
  format and the column reverts to its storage type's identity format.
- Read: `resolveFieldFormat(field.data_type, field.metadata)` — never read
  `metadata.format` by hand.
- A column with no declared format takes the identity format for its storage
  type, and `UserTableViewer` then renders it down its **original** code path.
  Existing tables are byte-identically unchanged until someone picks a format.

**Scopes / context items.** `contextValueTypeToFormat()` maps
`ContextValueType` onto a `FieldFormatId`. `ContextValueType` remains the
*storage* vocabulary (it decides which `value_*` column is written); the format
only decides display.

## Adding a format

1. Add one `FieldFormatDef` to `DEFS` in `registry.ts`. `format()` returns
   `null` — never `""`, never a throw — when a value does not fit.
2. If it needs a new option, add the key to `FieldFormatOptions` and a control
   to `FieldFormatPicker`, and list the key in the def's `optionKeys`.
3. If it renders richly, add a case to `renderRich` in
   `FormattedFieldValue.tsx` and set `rich: true`.
4. If it needs its own input, add a case to `FormatAwareInput` (in
   `features/data-tables/components/`), add its editor kind to `OWNED_EDITORS`,
   and handle it in `EditableCell`'s edit-mode branch.

No migration is ever required — a format is data in a JSONB column, and an
unknown format id degrades to the plain storage type by design.

## Change log

- **2026-08-14** — Created. Extracted the formatting concepts scattered across
  `ContextValueDisplay.renderTyped`, six per-domain `format.ts` helpers, and
  `UserTableViewer.formatCellValue` into one registry; wired data tables
  (picker, grid render, inline edit, row modals, column creation).
