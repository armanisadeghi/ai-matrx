# FEATURE.md — Matrx Data Table

**Status:** `active`
**Tier:** shared official primitive (`components/official/`)
**Last updated:** `2026-07-18`

---

## Purpose

The **canonical data table** for admin/list surfaces: sticky headers, every column
sortable + filterable, extensible toolbar facets, row → non-blocking side panel,
panel icon → WindowPanel with **View / Edit** tabs. Built so dozens of bespoke
tables (AI Models, relationships, …) can cut over to one contract.

## Entry points

- **Component:** `components/official/matrx-data-table/MatrxDataTable.tsx`
- **Types:** `components/official/matrx-data-table/types.ts`
- **UUID/FK cell:** `MatrxUuidCell.tsx`
- **Demo:** `/administration/ui/official-components/matrx-data-table`
- **First consumer:** `/administration/database/relationships`

## Invariants

- **Every column filters by default** (`filter: "auto"`). Opt out with `filter: false`.
- **Controlled mode delegates query execution, not rendering.** Pass
  `query={{ mode: "controlled", state, totalItems, onStateChange }}`; the table
  emits page/page-size/search/filter/sort changes while the feature owns the
  direct database query and returns only the current rows.
- **Controlled search feedback is immediate.** Consumers may debounce the query
  state, but must pass the immediate display state back to the table.
- **Select filters are type-to-search and MULTI-select (OR semantics)** — toggling options builds a `values` set; single-`value` writers stay valid. Whenever a column has blank cells, the options automatically include **"(empty)" / "(not empty)"** sentinels (composable with real values: "A or (empty)"). An explicit `filter: "select"` lists ALL distinct values (auto-inference still caps at 24 before falling back to text). **Text filters have Contains / (empty) / (not empty) modes.** **Sorting always puts empty cells last**, both directions. Active filters show a clear **X**; toolbar has **Clear all**.
- **Row click → `SidePanelSurface`** (desktop: `MatrxDynamicPanelHost`; mobile: Drawer). Never blocking `Sheet` / split-pane.
- **Panel icon → `WindowPanel`** with View / Edit sidebar tabs when an edit body exists (`renderEdit` or `detail.render`). `window.onOpen` hydrates edit state without opening the side panel.
- **UUID cells** always: short prefix (8), full on hover, always-visible copy. FK columns use `cellKind: "fk"` + `fk.onOpen` → WindowPanel of the target (or `"forbidden"`).
- **Copy** uses `CopyButtons` + `buildAgentPayload` (row + this view).
- **Inline edits are deferred** — draft locally, persist only on floating Save pill.
- **Never static-import `WindowPanel`** from a route — go through `DataRowWindow.dynamic.tsx`.
- **No barrel `index.ts`.** Import from source files.

## Mobile presentation (< `sm`, ~640px) — deliberate horizontal scroll

**Chosen: a frozen-identity-column scroll surface, not a card/list mode.**
Below `sm` the table sizes to its content (`w-max`) and the container scrolls
horizontally; the **first column freezes** (`max-sm:sticky left-0`, opaque
`bg-card` inherit) so every row stays identifiable, and a **right-edge fade +
chevron affordance** renders while more columns sit off-screen (recomputed on
scroll/resize, gone at scroll end). Desktop rendering is untouched.

*Why scroll over cards:* every consumer keeps full parity for free — sort,
per-column filters, inline edit, FK cells, row/window actions all keep working
with zero per-consumer config. A card mode would fork rendering (its own edit,
copy, FK, selection surfaces), demand a "primary column" convention ~20
existing consumers never declared, and silently drop the column-comparison
scanning that admin tables exist for. Scroll keeps ONE rendering path; the
frozen identity column + visible affordance is what makes it intentional
rather than raw overflow.

- **Zero-config.** Consumers do nothing. Opt out with `mobile="plain"`
  (removes the frozen column + affordance; content-sized scrolling stays —
  wrapping every column at 390px is never the right rendering).
- The first visible column is the identity column — order columns so the
  row's name/title/id comes first.

## Accessible names — every icon-only control MUST have `aria-label`

`title` alone is not an accessible name contract — every icon-only interactive
element gets an explicit `aria-label` (keep `title` too for hover tooltips).
The primitive covers its own controls: sort/filter header trigger
(`Sort or filter <column>` — pass string `header`s so the label is meaningful;
non-string headers fall back to the column id), clear-filter Xs, search/any-of
clear Xs, facet clear X, pagination arrows, panel-icon (`Open in window`),
UUID copy/open buttons, editor Save/Cancel, Copy/Export buttons.

**Consumer rule:** any icon-only or state-only control you render inside a
`cell`, `rowActions`, `headerActions`, or facet — a `Switch`, icon `Button`,
checkbox — must carry a row-specific `aria-label` (e.g.
`aria-label={`Enable ${row.name}`}`), not a bare icon. Sorted headers also
expose `aria-sort` on the `<th>` automatically.

## Contract (short)

```tsx
<MatrxDataTable
  data={rows}
  columns={[
    { accessorKey: "id", header: "ID", cellKind: "uuid" },
    {
      accessorKey: "provider_id",
      header: "Provider",
      cellKind: "fk",
      fk: {
        onOpen: (id) => openProviderWindow(id), // or return "forbidden"
        href: (id) => `/administration/…/${id}`, // optional new-tab
      },
    },
    …
  ]}
  getRowId={(r) => r.id}
  toolbar={{ facets: […], anyOf: { columnIds: ["a", "b"] } }}
  copy={{ label, location, rowKind, listKind, humanRow }}
  edit={{ enabled: true, onSave: async (edits) => { … } }}
  detail={{ title: (r) => r.name, render: (r) => <Editor row={r} /> }}
  window={{
    title: (r) => r.name,
    defaultTab: "edit",
    onOpen: (r) => hydrateEditor(r),
    // renderEdit falls back to detail.render
  }}
/>
```

| Feature     | How                                                                               |
| ----------- | --------------------------------------------------------------------------------- |
| Filters     | Per-column; searchable selects; clear-X; Clear all                                |
| `anyOf`     | OR-search across named columns                                                    |
| Copy        | Per-row + toolbar “this view”                                                     |
| Inline edit | `editable` on col; string in-cell; else popover; Save/Cancel pill                 |
| Window      | Sidebar View / Edit tabs; Edit = `renderEdit` ?? `detail.render`                  |
| UUID / FK   | `MatrxUuidCell` via `cellKind` or auto-detect; `fk.onOpen` / `href` / `forbidden` |

## AI Models cutover checklist (parity)

Do not drop these when replacing `AiModelTable`:

- Sticky header + typed column filters (provider, bools, number ranges)
- `MatrxUuidCell` on `id` (already swapped in AiModelTable)
- `provider_id` as `cellKind: "fk"` with WindowPanel / route to provider
- CopyButtons per row + this-view
- Bool badges, JSON capability summary
- Detail → SidePanelSurface (not `w-1/2` split); WindowPanel View/Edit

## Reuse gate

| Source                        | Took                                        | Left behind                             |
| ----------------------------- | ------------------------------------------- | --------------------------------------- |
| AiModelTable                  | sticky + filters + UuidCell → MatrxUuidCell | domain coupling, split-pane sidebar     |
| aidream UuidDisplay / IdField | short + copy + FK open semantics            | `/database/…` routes, GlobalRecordSheet |
| GenericDataTable              | pagination, empty/loading                   | no sticky / filters / panels            |
| RunControlsWindow             | WindowPanel sidebar tab pattern             | —                                       |
| `CopyButtons`                 | agent envelope                              | —                                       |

## Change Log

- `2026-08-08` — Phone/tablet interaction baseline: every table-owned button,
  input, and row link now keeps a 44px touch target below `lg`; desktop density is
  unchanged. This applies once at the primitive root, so toolbars, filters,
  actions, and pagination cannot independently regress to micro targets.
- `2026-08-08` — Mobile scroll surface completed: right-edge fade + chevron scroll affordance, `mobile="scroll"|"plain"` opt-out, frozen-column decision documented. Accessible-name audit: `aria-label` on every icon-only control (header filter trigger with column name, clear Xs, panel-icon, UUID open/copy, editor Save/Cancel, Copy/Export), `aria-sort` on sorted `<th>`. Consumer aria-label rule added.
- `2026-07-19` — Sticky header uses `bg-muted/90` + backdrop blur so column labels contrast with `bg-card` body rows.
- `2026-07-19` — Filter overhaul: multi-select (OR `values` set, back-compat with single `value`), automatic (empty)/(not empty) select sentinels, text filter Contains/(empty)/(not empty) modes, explicit-select options uncapped, empties sort last both directions.

- `2026-07-11` — WindowPanel View/Edit tabs; `MatrxUuidCell` (short/hover/copy/FK open/forbidden); `cellKind` + auto UUID; `window.onOpen` / `renderEdit`; AiModelTable UuidCell → MatrxUuidCell.
- `2026-07-11` — Searchable selects; clear-all; `anyOf`; Copy; deferred inline edit.
- `2026-07-11` — Initial primitive. Relationships first consumer.
- `2026-07-18` — Added controlled direct-query mode, server-sized pagination,
  fetching feedback, and `onRowOpen` cursor semantics for Marketing datasets.
