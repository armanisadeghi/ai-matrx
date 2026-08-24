/**
 * Surface manifest — Table Viewer (`matrx-user/table-viewer`).
 *
 * The floating Table Viewer window (overlay `tableViewerWindow`,
 * `TableViewerWindow`): the platform's generic "look at this data" window,
 * opened app-wide from any inline markdown table's "Open in window" action.
 * Distinct from `matrx-user/data-tables` (`/data`), which is the stored
 * user-data-table feature — this window is a read-only view of ONE markdown
 * table that arrived through overlay data, with no record behind it.
 *
 * WHY IT IS ITS OWN SURFACE: the window opens OVER an arbitrary page, so
 * before this manifest existed a right-click inside it resolved through
 * `detectActiveSurface()` and reported whatever route was underneath — the
 * user was in a table and the menu said "Notes". A window that floats over
 * everything must own its surface or it inherits a lie.
 *
 * Values mirror what the window actually holds: the markdown it was handed,
 * the parse of that markdown by the ONE table parser the renderer itself uses
 * (`parseMarkdownTable`), and the row the user right-clicked. There is no
 * record id here by design — the table is content, not an entity.
 *
 * Emitter: `TableViewerWindow` mounts `<SurfaceRuntimeProvider>` inside the
 * `WindowPanel` body (nested provider out-depths the host page's, by design)
 * and passes the same values to its `NonEditableContextMenu`.
 *
 * Curated groups (band 0-899):
 *   table_shape  What the table IS — title, columns, size
 *   table_data   The table's content and the row under the cursor
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const TABLE_VIEWER_SURFACE_NAME = "matrx-user/table-viewer";

const groups: SurfaceValueGroup[] = [
  {
    key: "table_shape",
    label: "Table shape",
    sortOrder: 100,
    description:
      "What the open table is — its window title, its columns, and how many rows it holds.",
  },
  {
    key: "table_data",
    label: "Table data",
    sortOrder: 200,
    description:
      "The table's own content: the source markdown, the parsed rows, and the row the user right-clicked.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "table_title",
    label: "Table title",
    description:
      'Title shown in the window chrome, passed by whatever opened the window. Always populated — falls back to "Table" when the opener supplied none.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    sortOrder: 300,
    group: "table_shape",
  },
  {
    name: "table_headers",
    label: "Column headers",
    description:
      "Cleaned column header labels, left-to-right, as parsed from the markdown. Always populated; empty array when the window holds no table or the markdown did not parse.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 160,
    sortOrder: 310,
    group: "table_shape",
  },
  {
    name: "table_row_count",
    label: "Row count",
    description:
      "How many data rows the table has (header row excluded). Always populated — zero when the window holds no table.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 320,
    group: "table_shape",
  },
  {
    name: "table_markdown",
    label: "Table markdown",
    description:
      "The raw markdown table the window was opened with, exactly as the opener passed it. Empty when the window was opened with no content (the empty state).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    sortOrder: 400,
    group: "table_data",
  },
  {
    name: "table_rows",
    label: "Table rows",
    description:
      "Every data row as a header-keyed object, in display order — the same normalized parse the renderer draws. Empty array when no table is open. Large on a wide table, so it is bindable rather than auto-shipped.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 410,
    group: "table_data",
  },
  {
    name: "active_row_index",
    label: "Right-clicked row",
    description:
      "Zero-based index of the row the user right-clicked. Empty when the user right-clicked outside any row (the header, the padding, or the empty state).",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 420,
    group: "table_data",
  },
  {
    name: "active_row",
    label: "Right-clicked row data",
    description:
      "The right-clicked row as a header-keyed object. Empty when the user right-clicked outside any row — bind here for an agent that should act on one row rather than the whole table.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 430,
    group: "table_data",
  },
];

export const tableViewerManifest: SurfaceManifest = {
  surfaceName: TABLE_VIEWER_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Manifest + emitter + menu wiring shipped 2026-08-24; no agent is bound yet and the non-matching-name binding test has not been run.",
  overlayId: "tableViewerWindow",
  label: "Table Viewer",
  intro: `<surface_intro>
You are on the Table Viewer — a floating window that shows ONE markdown table at full size. It is opened from a table somewhere else in the app (a chat answer, a report, a generated result), so the table is content, not a stored record: there is no row id, no owner, and nothing here to save.
table_headers and table_row_count describe the table's shape; table_markdown is its source and table_rows is the same data as header-keyed objects. active_row / active_row_index are populated only when the user right-clicked a specific row — when they are empty the user is acting on the whole table.
The work here is reading, checking, reshaping and explaining tabular data: summarize it, spot outliers, convert it, or answer questions about what is in it.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

/** Type-safe payload helper — required keys mirror `alwaysAvailable: true`. */
export function createTableViewerScope(values: {
  table_title: string;
  table_headers: string[];
  table_row_count: number;
  table_rows: Record<string, unknown>[];
  table_markdown?: string;
  active_row_index?: number;
  active_row?: Record<string, unknown>;
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
