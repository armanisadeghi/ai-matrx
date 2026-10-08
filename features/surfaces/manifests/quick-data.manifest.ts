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
 * `QuickDataSheet` (table picker + the one table page, `LocatedTableViewer` →
 * `UnifiedTableBody`). That table page mounts the far richer
 * `matrx-user/data-tables` surface (schema, rows on screen, selection, one
 * cell write) itself, and the runtime registry resolves deepest-first — so
 * while a table is open the agent reads THAT surface, and this one covers only
 * what `QuickDataSheet` itself holds: the table picker (list + selection) and
 * its load state. See `readinessNote`.
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
} from "@ai-matrx/chat/surfaces/types";
import { MATRX_WEB_APP_EXECUTOR } from "@ai-matrx/chat/surfaces/executor";

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
      "True while the window's table list is being fetched (older and custom tables, one list). Always populated while the window is mounted.",
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
  client: "matrx-user",
  executor: MATRX_WEB_APP_EXECUTOR,
  executionMode: "python-stream",
  description:
    "Quick data table browser overlay",
  readiness: "partial",
  readinessNote:
    "Emitter wired in QuickDataSheet and reflects its real state (table picker + selection). The open table's deep state (schema, rows on screen, selection, the one cell write) is the `matrx-user/data-tables` surface, mounted by the one table page inside this window; deepest-first resolution hands the agent that surface while a table is open, so nothing is duplicated here.",
  overlayId: "quickDataWindow",
  label: "Quick Data",
  intro: `<surface_intro>
You are in the floating Quick Data window — a portable table picker a caller opened to browse the user's data tables (from a markdown table/csv/json block, the data-review "send to" menu, or the user's own quick actions) without leaving what they were doing. tables_summary lists every table available; selected_table_id / selected_table_name identify the one currently shown. This surface only covers the PICKER — schema, rows, and cell edits belong to the Data Tables surface, which the open table mounts inside this window.
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
