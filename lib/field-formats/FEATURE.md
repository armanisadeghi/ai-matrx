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
| `registry.ts` | THE registry — 23 formats, their `format()` / `parse()`, and `formatsForBase` / `defaultFormatForBase` |
| `format.ts` | `formatFieldValue`, `parseFieldInput`, `resolveFieldFormat`, `readFieldFormatConfig` — THE FALLBACK LAW lives here |
| `FormattedFieldValue.tsx` | The ONE read-only renderer (links, swatch, chips, stars, amber mismatch) |
| `FieldFormatPicker.tsx` | The ONE picker — format select + only the options that format reads; stacked by default, `layout="embedded"` exposes the option rail to a responsive parent |
| `context-value-types.ts` | Bridge from the scopes `ContextValueType` vocabulary |
| `choices.ts` | THE choice resolver — inline options, pick-list hydration, per-row narrowing (`choicesForRow`), the chip palette |
| `ChoiceOptionsEditor.tsx` | THE options editor — seeds from real values, binds a pick list, declares a dependent column |

## The formats

Text: `text` `long_text` `markdown` `email` `url` `phone` `color`
Numbers: `number` `decimal` `currency` `percent` `duration` `integer` `rating` `file_size`
Choice: `boolean` `choice` `multi_choice`
Dates: `date` `datetime` `relative_time`
Structured: `json` `array` `tags` `formula`

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
- Dense consumers use `layout="embedded"` plus `optionsClassName` to place
  format-specific controls on their own responsive rail. The default remains
  stacked so existing callers do not change layout.

**Scopes / context items.** `contextValueTypeToFormat()` maps
`ContextValueType` onto a `FieldFormatId`. `ContextValueType` remains the
*storage* vocabulary (it decides which `value_*` column is written); the format
only decides display.

## Choice — an enum with no database enum

`choice` (on a `string`) and `multi_choice` (on an `array`) give a column an
option list **without touching the database**. Same trick `percent` plays on a
number: the storage type is unchanged, nothing is enforced server-side, and
stripping the format leaves every value exactly as it was.

**THE MISMATCH IS THE FEATURE.** An off-list value is never rejected and never
blanked — `format()` returns null, the fallback law renders it amber with
"still saved, and safe to fix or add as an option". Declaring options over live
data is how a user FINDS their stray values, not how they lose them. This is
what makes the format safe to switch on over a populated column.

**Nobody types a list they already have.** `ChoiceOptionsEditor` takes
`suggestions` (from `udt_column_facets`, ordered by row count) and offers the
column's real values for one-click acceptance.

### Two option sources

| `options.choices` | Inline. Private to this column. |
| `options.structuredList` | A shared pick list (`workbench.udt_structured_lists`), so "Status" means one thing across every table. |

The binding shape is **not ours to invent**: `{ listId, groupName, multiple }`
is aidream's `PicklistBinding`, already written by the agent-variable system as
`customComponent.structured_list`. A column and an agent variable must speak ONE
option vocabulary. Loading is not reimplemented either — it goes through
`features/user-lists`' cached, group-ordered, label-only hook (an item's secret
`description` never reaches the client).

### Tiering, free

A pick list's items already carry `group_name`, so a bound column gets tiers
with nothing extra stored: the cell holds the item, the item knows its group.
The dropdown renders sections; `groupName` narrows to a single tier with no
second list to maintain.

### Dependent columns

`groupFromField` makes the group come from **another column's cell** instead of
a constant — pick a Continent, and Country narrows to that continent's group.

- Declared **only on the constrained column**. The controlling column needs no
  configuration and does not know it is one.
- **Chains are free and cycles cannot loop.** Each link reads its controller's
  current value at render time (`choicesForRow`, a pure filter over
  already-loaded options), so A → B → C needs no graph and no extra fetch.
- **An empty controller offers every group** — never an empty dropdown.
- **Changing a controller never rewrites the dependent cell.** A value that no
  longer fits goes amber and the user decides. Auto-clearing would be silent
  data loss.
- A row FORM passes its LIVE draft as `row`, so the narrowing follows the user's
  typing rather than the saved row.

### What agents see

`column_list` carries `format` and, for a choice column, its resolved
`choices`. Without this an agent reads storage type only and cannot tell a
`percent` column's `45` from `0.45`. Both keys are OMITTED rather than sent
empty — an empty `choices` would read as "this column offers nothing".

## Formula — a column computed from its own row

`formula` is a column whose value is **computed on read from the other columns
of the same row**, Airtable-style. Champion: Airtable's formula field.

**It stores nothing.** The cell is always `null` in the database. The
expression lives in `metadata.format.options.formula = { expression,
resultFormat? }` — the same JSONB the other formats' options live in — so a
formula needs no migration, no column type, and no server support, and
stripping the format leaves an ordinary empty text column behind.

**The engine is `features/data-tables/formulas.ts`** — pure, dependency-free,
and with **no `eval` and no `new Function`**: formula text is tokenized, parsed
to an AST, and interpreted. Nothing a user types ever becomes JavaScript.

```
parseFormula(source)            → { ok, ast, references[] } | { ok: false, error, position }
evaluateFormula(ast, resolve)   → { ok, value } | { ok: false, error }
formulaResultType(ast, columnType) → "number" | "text" | "boolean" | "date" | "unknown"
FORMULA_FUNCTIONS                  the help list the editor renders
```

Nothing throws. A syntax error, an unknown column, a division by zero and a
type mismatch are all `ok: false` with a plain-English sentence — the same
posture as THE FALLBACK LAW above.

### The language

A column is referenced as `{Display Name}` or `{field_name}`; `parseFormula`
reports every name it saw in `references`, and the CALLER resolves them (it
owns the table, the engine does not). `resolve(name)` returns the cell value,
or `undefined` for a column that does not exist — "empty" and "misspelt" are
different answers, and conflating them is how a formula returns a confident
wrong number.

- Values: numbers, `'single'` / `"double"` quoted text, `TRUE` / `FALSE`
- Operators: `+ - * / %`, unary `-`, brackets, `&` (join text),
  `= != <> < <= > >=`
- Functions: `SUM` `MIN` `MAX` `AVERAGE` `ROUND` `ABS` · `LEN` `UPPER` `LOWER`
  `TRIM` `CONCATENATE` `LEFT` `RIGHT` `CONTAINS` · `IF` `AND` `OR` `NOT` ·
  `BLANK` `ISBLANK` · `TODAY` `NOW` `DATEDIFF` `YEAR` `MONTH` `DAY` `DATEADD`

Coercion rules (the full list is the header of `formulas.ts`): BLANK is
`null`/`undefined`/`""`; arithmetic reads BLANK as `0` so a half-filled row
still computes, while **aggregates SKIP blanks** so `AVERAGE` divides by the
values that were actually there; numeric strings coerce and `"n/a"` is a named
type error; dates are ISO strings read and written **in UTC**; division by zero
is an error, never `Infinity`.

### Display

`resultFormat` says how the computed value is rendered — a computed total as
`currency`, a computed date as `date` — and the formula format delegates to
that format's own `format()`, passing the same options through. With no
`resultFormat` the value renders plainly. `formulaResultType` gives the UI a
best-effort static type so it can suggest the right one.

### The documented limitations

- **Client-side only.** The value is computed in the browser at render time.
- **Never sortable or filterable server-side**, and never searchable: there is
  no stored value for PostgREST to order or match on. A surface that sorts a
  formula column must sort what it has already loaded, and say so.
- **Not editable.** The editor kind is `computed`, which is how the grid knows
  to refuse an edit instead of offering an input that would be thrown away.
- **Same row only.** A formula reads its own row's columns — no lookups across
  rows or tables, and no aggregation over a table.

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

- **2026-09-14** — Added `formula`: a column computed on read from the other
  columns of its own row (Arman approved). The language lives in
  `features/data-tables/formulas.ts` — tokenizer, parser and interpreter, no
  `eval`, nothing throws — and the format stores nothing, renders through an
  optional `resultFormat`, and declares the `computed` editor kind so the grid
  refuses editing. Not sortable or filterable server-side, by construction.

- **2026-08-19** — Added `choice` / `multi_choice`: option lists as a pure UI
  layer, hydrated inline or from a shared pick list (which supplies grouping,
  and therefore tiers, for free). Added dependent columns (`groupFromField`),
  where a column's options narrow to the group another column's cell names.
  Reused aidream's `PicklistBinding` shape and `features/user-lists`' loading
  hook rather than forking either. `column_list` now tells agents a column's
  format and options.
- **2026-08-16** — Added the opt-in embedded layout contract so Table Settings
  keeps the primary format selector aligned while its conditional controls take
  a full responsive rail; the default stacked contract remains unchanged.
- **2026-08-14** — Created. Extracted the formatting concepts scattered across
  `ContextValueDisplay.renderTyped`, six per-domain `format.ts` helpers, and
  `UserTableViewer.formatCellValue` into one registry; wired data tables
  (picker, grid render, inline edit, row modals, column creation).
