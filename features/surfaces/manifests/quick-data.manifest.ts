/**
 * Surface manifest — Quick Data (`matrx-user/quick-data`).
 *
 * Overlay surface for the floating Quick Data window
 * (`features/window-panels/windows/QuickDataWindow.tsx`, overlay id
 * `quickDataWindow`, single-instance). A caller opens it from ~12 call sites
 * (csv/json/table markdown blocks, the data-review "send to" menu, the
 * user-menu quick actions, …) to browse the user's data tables without
 * losing their place on the current page.
 *
 * SCOPE OF THIS SURFACE vs `matrx-user/data-tables`: the window renders
 * `QuickDataSheet` (table picker + `UserTableViewer`). `UserTableViewer`
 * already owns a FAR richer surface — `matrx-user/data-tables` — covering
 * schema, the visible page of rows, search, per-column filters, and the open
 * cell/row editor, but its `SurfaceRuntimeProvider` is opt-in
 * (`emitSurfaceScope`) specifically so it does not shadow a HOST surface when
 * `UserTableViewer` is mounted inside someone else's overlay (see the
 * docblock in `data-tables.manifest.ts`). Quick Data is exactly that case —
 * `QuickDataWindow` deliberately does NOT pass `emitSurfaceScope`, so this
 * manifest declares only what `QuickDataSheet` itself actually holds: the
 * table picker (list + selection) and its load state. It does NOT duplicate
 * `data-tables`' row/cell/search/filter values, because `QuickDataSheet`
 * has no access to that state — it lives, un-lifted, inside the nested
 * `UserTableViewer` instance. See `readinessNote`.
 *
 * Emitter: `<SurfaceRuntimeProvider>` mounted inside `QuickDataSheet.tsx` —
 * the component that actually owns the table-picker state. It renders inside
 * `QuickDataWindow`, so this is still "inside the window component" per the
 * overlay-surface doctrine; the window shell itself (`QuickDataWindow.tsx`)
 * holds no state of its own to emit.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";

export const QUICK_DATA_SURFACE_NAME = "matrx-user/quick-data";

const groups: SurfaceValueGroup[] = [
  {
    key: "table_picker",
    label: "Table picker",
    sortOrder: 100,
    description:
      "The list of the user's data tables offered in this window and which one is currently open.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "is_loading",
    label: "Loading",
    description:
      "True while the window's table list is being fetched (get_user_tables). Always populated while the window is mounted.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "table_picker",
    sortOrder: 100,
  },
  {
    name: "load_error",
    label: "Load error",
    description:
      "Message from a failed table-list fetch. Absent when the list loaded successfully or is still loading.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    group: "table_picker",
    sortOrder: 110,
  },
  {
    name: "table_count",
    label: "Table count",
    description:
      "Number of data tables available to pick from in this window. Zero while loading or when the user has no tables.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    group: "table_picker",
    sortOrder: 120,
  },
  {
    name: "tables_summary",
    label: "Available tables",
    description:
      "Every table offered in the picker dropdown, most-recently-updated first: { id, table_name, description, row_count, field_count, updated_at }. Empty array while loading or when the user has no tables.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 900,
    group: "table_picker",
    sortOrder: 130,
  },
  {
    name: "selected_table_id",
    label: "Selected table ID",
    description:
      "UUID of the table currently shown in the viewer. Empty until the picker has a table selected (auto-selects the most recently updated table once the list loads, or the caller's requested table when the window was opened with one).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "table_picker",
    sortOrder: 140,
  },
  {
    name: "selected_table_name",
    label: "Selected table name",
    description:
      "Name of the table named by `selected_table_id`, from `tables_summary`. Empty when no table is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    group: "table_picker",
    sortOrder: 150,
  },
];

export const quickDataManifest: SurfaceManifest = {
  surfaceName: QUICK_DATA_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Emitter wired in QuickDataSheet and reflects its real state (table picker + selection). Gap (COMPLETENESS LAW, not fabricated here): the deep table state — schema, visible rows, search, column filters, and the open cell/row editor — belongs to the `matrx-user/data-tables` surface and is only emitted by `UserTableViewer` when its host passes `emitSurfaceScope`, which `QuickDataWindow` deliberately does not (that provider is opt-in precisely to avoid shadowing a host surface — see `data-tables.manifest.ts`). QuickDataSheet has no lifted access to that nested state today, so it cannot be declared here without fabricating a value the component doesn't hold. If deep table editing inside this window becomes a real use case, the fix is either (a) accept the deepest-wins nesting and pass `emitSurfaceScope` through, degrading quick-data's own scope to invisible while a table is open, or (b) lift UserTableViewer's search/filter/edit state out so QuickDataSheet can re-emit it under this surface's own vocabulary.",
  overlayId: "quickDataWindow",
  label: "Quick Data",
  intro: `<surface_intro>
You are in the floating Quick Data window — a portable table picker a caller opened to browse the user's data tables (from a markdown table/csv/json block, the data-review "send to" menu, or the user's own quick actions) without leaving what they were doing. tables_summary lists every table available; selected_table_id / selected_table_name identify the one currently shown. This surface only covers the PICKER — schema, rows, and cell edits belong to the Data Tables surface and are not available here while embedded in this window.
</surface_intro>`,
  groups,
  values: surfaceSpecific,
  // Table-picker widget — no text/content/selection concept of its own.
  skipBaselineValues: true,
};

/**
 * One entry of `tables_summary`.
 */
export interface QuickDataTableSummaryEntry {
  id: string;
  table_name: string;
  description: string;
  row_count: number;
  field_count: number;
  updated_at?: string;
}

/**
 * Type-safe payload helper — required keys mirror every `alwaysAvailable:
 * true` value above; optional keys mirror the rest.
 */
export function createQuickDataScope(values: {
  is_loading: boolean;
  table_count: number;
  tables_summary: QuickDataTableSummaryEntry[];
  load_error?: string;
  selected_table_id?: string;
  selected_table_name?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
