/**
 * Surface manifest — Data tables (`matrx-user/data-tables`).
 *
 * User-generated tables / spreadsheet views (route `/data/[id]`). The user
 * browses and edits rows in a custom table they created, with sorting,
 * pagination, search, per-column filters, and per-cell editing.
 *
 * Agents bound here operate on a cell (clean / reformat this value), a row
 * (enrich this record), a column (classify all values), or the whole table
 * (summarize, find anomalies). The table is a natural persistence target for
 * agent output, so `table_id` + schema are first-class.
 *
 * MOUNT (added 2026-08-11 — this surface's FIRST live emitter): the values
 * below are emitted by `UserTableViewer`, which owns every one of them
 * (table row, field defs, the loaded page of rows, search, selection). That
 * component is ALSO mounted inside overlays that belong to OTHER surfaces
 * (`DatasetOverlay` in tool-call visualisation, `ViewTableModal` in markdown
 * display, the `UserTableWindow` panel), and the runtime registry resolves
 * deepest-first — an ungated provider there would shadow the host surface and
 * offer THIS surface's write targets on someone else's page. So the provider
 * is opt-in via `emitSurfaceScope`, which only `/data/[id]`'s
 * `DataTableDetailClient` passes. The `/data` LIST route deliberately mounts
 * NOTHING: it renders table cards, has no authored state, and nothing here is
 * writable from it.
 *
 * The write half (`writeTargets`, below) is deliberately narrow: a description
 * and ONE cell at a time. See the docblock above `writeTargets` for what was
 * declined and why.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { FIELD_DATA_TYPES } from "@/features/data-tables/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

/** Real column-type vocabulary, spelled into the model-facing contract. */
const FIELD_TYPE_ENUM_TEXT = FIELD_DATA_TYPES.map((t) => `"${t}"`).join(" | ");

const groups: SurfaceValueGroup[] = [
  {
    key: "table_identity",
    label: "Table identity",
    sortOrder: 100,
    description:
      "Which table is open and what it is for. Empty on the /data list route.",
  },
  {
    key: "table_structure",
    label: "Table structure",
    sortOrder: 200,
    description:
      "The table's columns and their types — the schema a cell write must satisfy.",
  },
  {
    key: "active_selection",
    label: "Active selection",
    sortOrder: 300,
    description:
      "The cell or row the user has open right now. Populated only while a row or cell editor is open.",
  },
  {
    key: "table_data",
    label: "Table data",
    sortOrder: 400,
    description:
      "The row bodies — the visible page, the full table when it has been loaded, and the active search.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Table identity (300-319) ──────────────────────────────────────────
  {
    name: "table_id",
    label: "Table ID",
    description:
      "UUID of the user table being viewed. Empty when no table is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "table_identity",
    sortOrder: 300,
  },
  {
    name: "table_name",
    label: "Table name",
    description:
      "Name / label of the open table. Empty when no table is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    group: "table_identity",
    sortOrder: 310,
  },
  {
    name: "table_description",
    label: "Table description",
    description:
      "User-set description of the table — what it holds and what it is for. Empty when unset or no table is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "table_identity",
    sortOrder: 315,
  },
  {
    name: "row_count",
    label: "Row count",
    description:
      "Total number of rows in the table across all pages (after the active search / column filters, which is what the pager counts). Zero when empty or no table is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    group: "table_identity",
    sortOrder: 318,
  },

  // ── Table structure (320-339) ─────────────────────────────────────────
  {
    name: "table_schema",
    label: "Table schema",
    description:
      "Object mapping each column's machine field name to its declared data type. Empty object when no table is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 800,
    group: "table_structure",
    sortOrder: 320,
  },
  {
    name: "column_list",
    label: "Columns",
    description:
      "Array of `{ name, display_name, type, required, order }` for every column, in display order. `name` is the MACHINE field name (what a cell write must send); `display_name` is the header the user sees. Empty array when no table is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 500,
    group: "table_structure",
    sortOrder: 325,
  },

  // ── Active selection (340-369) ────────────────────────────────────────
  {
    name: "current_cell_value",
    label: "Current cell value",
    description:
      "Value of the cell the user has open in the full-content editor, stringified. Empty unless that editor is open — this grid has no persistent click-to-select cell, so a cell is 'current' only while its expanded editor is on screen.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    group: "active_selection",
    sortOrder: 340,
  },
  {
    name: "current_column_name",
    label: "Current column",
    description:
      "MACHINE field name of the column containing the open cell — the same value a cell write sends as `field_name`, not the display header. Empty when no cell editor is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "active_selection",
    sortOrder: 345,
  },
  {
    name: "current_row_id",
    label: "Current row ID",
    description:
      "UUID of the row whose cell editor or row editor is open. Empty when neither is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "active_selection",
    sortOrder: 350,
  },
  {
    name: "current_row_json",
    label: "Current row",
    description:
      "The row named by `current_row_id` as a JSON object keyed by machine field name. Empty object when no row is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 600,
    group: "active_selection",
    sortOrder: 355,
  },

  // ── Table data (370-399) ──────────────────────────────────────────────
  {
    name: "visible_data_csv",
    label: "Visible rows (CSV)",
    description:
      "The currently-visible page of rows as CSV. The FIRST column is `row_id` (the UUID a cell write needs) and the remaining headers are machine field names. Empty when no data is visible.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    group: "table_data",
    sortOrder: 370,
  },
  {
    name: "full_table_json",
    label: "Full table (JSON)",
    description:
      "Every row of the table as an array of `{ row_id, ...cells }` objects. Can be very large — bind with care. Present ONLY when the viewer has already loaded the whole dataset (it does that for column filtering and whole-table sorting); absent otherwise rather than triggering a fetch.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    group: "table_data",
    sortOrder: 380,
  },
  {
    name: "search_term",
    label: "Search term",
    description:
      "Active table search/filter string the user has applied. Empty when the search box is blank.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    group: "table_data",
    sortOrder: 390,
  },
  {
    name: "is_read_only",
    label: "Read-only",
    description:
      "True when the signed-in user may VIEW this shared table but not change it (no owner or editor grant). Every write target is refused while this is true. Always populated once the table has loaded.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "table_identity",
    sortOrder: 319,
  },
];

/**
 * Write targets — a description, and ONE cell at a time.
 *
 * WHAT EARNS A TARGET HERE. This page is a data grid: almost everything on it
 * is the user's own data, and the destructive operations are one click from
 * the useful ones. Two things clear the bar:
 *
 *  - `table_description` is authored prose. It is the field users leave blank
 *    because writing it is a chore, an agent that has just read the columns
 *    and a page of rows can write it better than a blank field, and it is
 *    metadata — nothing downstream computes on it. It persists to one column
 *    through the RPC that COALESCEs every other field, so it cannot disturb
 *    the table's name or visibility.
 *  - `cell_value` is the operation this surface exists for ("clean this
 *    value", "reformat this date", "fill in the category"). It is ONE cell,
 *    identified by an explicit `{row_id, field_name}` pair the agent must have
 *    READ off the page, and it lands through `udt_upsert_cell` — a surgical
 *    `jsonb_set` that structurally cannot touch another cell, another row, or
 *    the column definitions. Row history (`udt_dataset_row_versions`, exposed
 *    on this page as Row history) makes it revertible.
 *
 * WHY COORDINATES TRAVEL WITH THE VALUE, as one object rather than three
 * targets: row + column + value are ONE decision. Split apart, an agent that
 * set the column and then the value would race the user's own navigation and
 * land a value in whatever cell the page happened to point at — the failure
 * mode being that it silently writes the WRONG cell, which on a grid is worse
 * than refusing. Bundled, the handler sees all three at once and can check
 * them against the live grid before anything is written. It deliberately does
 * NOT read a "currently selected cell" out of page state: `applySurfaceWrite`
 * resolves the handler before the user answers the confirm dialog, so any
 * coordinate read from a render closure can be stale by the time Apply is
 * pressed. The agent naming the cell explicitly is what makes the write
 * verifiable — and if the row has scrolled out of the visible page in the
 * meantime, the handler REFUSES and tells the agent to re-read, rather than
 * guessing.
 *
 * WHY THE ROW MUST BE ON THE VISIBLE PAGE: it is the blast-radius guarantee.
 * A cell an agent writes is one the user can see change, on the screen they
 * are already looking at, next to the value it replaced. A write to page 7 of
 * a 400-row table would be invisible and effectively unreviewable, so it is
 * refused even though the RPC would happily accept it.
 *
 * DECLINED, and why each one stays human:
 *  - `table_name` and `table_id` — identity. Other tables, saved references
 *    and the Row-history URLs point at this table by name and id.
 *  - `table_schema` / `column_list` — structure. Adding or retyping a column
 *    is a migration wearing a form's clothes: `udt_change_field_type` rewrites
 *    every row in the table and un-castable values become null. That is data
 *    loss behind an innocuous-sounding request, and there is no undo.
 *  - `full_table_json`, `visible_data_csv`, `current_row_json` — these are
 *    EVIDENCE values, not write paths. Replacing a whole table body (or even a
 *    whole row) is the single most destructive thing available on this page,
 *    and the user has no way to review a 400-row diff in a confirm dialog. An
 *    agent that wants to change ten cells calls `cell_value` ten times, and
 *    the user accepts or declines each one — which is slower on purpose.
 *  - Row deletion — deletes stay human, by doctrine.
 *  - `search_term` — the user's own filter. Moving it changes what they are
 *    looking at to something they did not ask for, and the agent already holds
 *    the rows in context, so it learns nothing by filtering.
 *  - `is_read_only` — a permission fact, not a setting.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "table_description",
    label: "Table description",
    description:
      "Sets the open table's description — the short prose that says what this table holds and what it is for. Value is PLAIN TEXT, not JSON and not JSON-encoded: send the sentence itself, with no surrounding quotes and no escaped newlines. Replaces the existing description in full, so include anything from table_description worth keeping; read that value first. 1-3 sentences is right (hard limit 2000 characters, refused above it) and an empty or whitespace-only value is refused — clearing the description is the user's call, not an agent's. Persists immediately on confirm through the table-metadata RPC, which writes ONLY this column: the table's name and visibility are left untouched. Refused when is_read_only is true.",
    valueType: "string",
    updatesValue: "table_description",
    mode: "entity",
    applyPolicy: "ask",
    group: "table_identity",
    sortOrder: 100,
  },
  {
    name: "cell_value",
    label: "Cell value",
    description:
      `Writes ONE cell of the open table. Value is an object with all three keys: { row_id: string, field_name: string, value: string | number | boolean | null }. \`row_id\` is the row's UUID — take it from the first column of visible_data_csv, from full_table_json, or from current_row_id; it MUST be a row on the page currently on screen, and a row that is not is refused rather than written invisibly (ask the user to navigate to it, or clear the search). \`field_name\` is the column's MACHINE name from column_list's \`name\` — NOT the display header, and a name that is not a real column is refused with the list of the real ones. \`value\` is coerced to that column's declared type (${FIELD_TYPE_ENUM_TEXT}); a value that cannot be coerced — "tomorrow" into a number, unparseable text into a "json" column — is refused rather than stored as garbage. Send null to empty the cell. ONE cell per call: to fix several, call once per cell so the user can accept or decline each one individually. This lands through the surgical single-cell RPC, which cannot touch any other cell, row, or column definition. Persists immediately on confirm; the grid reloads so the user sees it, and Row history can revert it. Refused when is_read_only is true.`,
    valueType: "object",
    updatesValue: "current_cell_value",
    mode: "entity",
    applyPolicy: "ask",
    group: "active_selection",
    sortOrder: 110,
  },
];

export const dataTablesManifest: SurfaceManifest = {
  surfaceName: "matrx-user/data-tables",
  readiness: "partial",
  readinessNote:
    "Emitter + write handlers live on the /data/[id] mount (UserTableViewer, gated by emitSurfaceScope) and verified against the live page. Still missing: data-surface-value Locate anchors on the grid, and the /data LIST route emits nothing by design (no authored state there).",
  label: "Data Tables",
  urlPattern: "/data/[id]",
  intro: `<surface_intro>
You are on the Data Tables surface: the user is looking at one table they created, at /data/[id] — a paginated grid with search, per-column filters, sorting, inline per-cell editing and per-row history.
table_id / table_name / table_description identify the table. table_schema and column_list are its columns; column_list's \`name\` is the MACHINE field name every write uses, and \`display_name\` is the header the user reads — never send a display name where a field name is wanted.
The row bodies are visible_data_csv (the page on screen, whose first CSV column is row_id) and, when the viewer has already loaded it, full_table_json. row_count is the total after the user's search. search_term is the user's own filter — read it to know why rows are missing.
current_cell_value / current_column_name / current_row_id / current_row_json describe the cell or row the user has open right now, and are empty when no editor is on screen. This grid has no persistent selected cell, so do not wait for one.
This is the user's real data. You may write ONE cell at a time with cell_value, naming the row and column explicitly from what you have READ, and only for a row on the page currently on screen — that is what lets the user see the change land. You may write table_description. Everything else is theirs: columns and types are a migration that can destroy values, whole-table and whole-row replacement is unreviewable, deletes are human, and search_term is their filter.
is_read_only tells you whether you may write at all; on a shared table you can read but every write is refused.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/**
 * One column as emitted in the `column_list` surface value.
 *
 * `name` is the machine field name (what `cell_value` writes against);
 * `display_name` is the header the user sees.
 */
export interface DataTableColumnEntry {
  name: string;
  display_name: string;
  type: string;
  required: boolean;
  order: number;
}

export function createDataTablesScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  table_id?: string;
  table_name?: string;
  table_description?: string;
  is_read_only?: boolean;
  table_schema?: Record<string, unknown>;
  column_list?: DataTableColumnEntry[];
  row_count?: number;
  current_cell_value?: string;
  current_column_name?: string;
  current_row_id?: string;
  current_row_json?: Record<string, unknown>;
  visible_data_csv?: string;
  full_table_json?: unknown[];
  search_term?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
