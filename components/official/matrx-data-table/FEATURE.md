# FEATURE.md — Matrx Data Table

**Status:** `active`
**Tier:** shared official primitive (`components/official/`)
**Last updated:** `2026-07-11`

---

## Purpose

The **canonical data table** for admin/list surfaces: sticky headers, every column
sortable + filterable, extensible toolbar facets, row → non-blocking side panel,
panel icon → WindowPanel. Built so dozens of bespoke tables can cut over to one
contract.

## Entry points

- **Component:** `components/official/matrx-data-table/MatrxDataTable.tsx`
- **Types:** `components/official/matrx-data-table/types.ts`
- **Demo:** `/administration/official-components/matrx-data-table`
- **First consumer:** `/administration/relationships`

## Invariants

- **Every column filters by default** (`filter: "auto"`). Opt out with `filter: false`.
- **Row click → `SidePanelSurface`** (desktop: `MatrxDynamicPanelHost`; mobile: Drawer). Never blocking `Sheet` / split-pane.
- **Panel icon → `WindowPanel`** (page-local, lazy). Custom body via `window.render`; default = `DataRowInspector`.
- **Toolbar facets are first-class** (`button-group` today; add `radio` / `switch` / `custom` — don't fork).
- **Never static-import `WindowPanel`** from a route — go through `DataRowWindow.dynamic.tsx`.
- **No barrel `index.ts`.** Import from source files.

## Contract (short)

```tsx
<MatrxDataTable
  data={rows}
  columns={cols}
  getRowId={(r) => r.id}
  toolbar={{ facets: [{ type: "button-group", ... }], search: true }}
  detail={{ title: (r) => r.name, render: (r) => <Editor row={r} /> }}
  window={{ title: (r) => r.name, render?: (r) => <Custom /> }}
/>
```

## Reuse gate (what this replaced / stole from)

| Source | Took | Left behind |
|---|---|---|
| AiModelTable | sticky + typed column filter popovers | domain coupling, missing filters, wrong `w-1/2` sidebar |
| GenericDataTable / AppletListTable | pagination, empty/loading, actions column | no sticky, no column filters, no panels |
| ColumnHeaderMenu / DocumentsHub filters | filter popover UX | UDT / projects coupling |
| SidePanelSurface | side chrome | — |

## Change Log

- `2026-07-11` — Initial primitive. Relationships cut over as first consumer.
