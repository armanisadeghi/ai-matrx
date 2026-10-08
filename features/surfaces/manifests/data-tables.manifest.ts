/**
 * Surface manifest — Data tables (`matrx-user/data-tables`).
 *
 * A person's table in the record store (route `/data/[tableId]`). The user
 * browses and edits records in a table, with sorting, pagination, search,
 * per-column filters, and per-cell editing.
 *
 * Agents bound here operate on a cell (clean / reformat this value), a row
 * (enrich this record), a column (classify all values), or the whole table
 * (summarize, find anomalies). The table is a natural persistence target for
 * agent output, so `table_id` + schema are first-class.
 *
 * MOUNT (2026-10-04, lane CHAIR-ONE-GRID): the values are emitted by
 * `RecordStoreTableSurface` (features/unified-data/grid-agent-context) over the
 * ONE table page — `UnifiedTableBody`, the component /data/[tableId] renders and
 * every other host mounts too (the table window, the chat "view table" modal, a
 * canvas table, the Quick Data sheet, a Board tile). The merged grid tells it
 * where the person is (`onGridContext`); its one write lands through
 * `@ai-matrx/records`. Inside a window the runtime registry resolves
 * deepest-first, so while a table is open the agent sees THIS table. The `/data`
 * home deliberately mounts NOTHING: it lists tables, has no authored state.
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
} from "@ai-matrx/chat/surfaces/types";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { FIELD_DATA_TYPES } from "@/features/data-tables/types";
import { mergeBaselineValues, pickBaseline } from "@ai-matrx/chat/surfaces/manifests/_baseline.manifest";
import { MATRX_WEB_APP_EXECUTOR } from "@ai-matrx/chat/surfaces/executor";

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
      "The cell or row the user is on right now — the selected cell (a click, or the arrow keys) or the row whose editor is open.",
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
      "UUID of the custom table being viewed. Empty when no table is open.",
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
    name: "row_label_rule",
    label: "Row label rule",
    description:
      "How this table NAMES a row wherever a row is referred to — the user's 'primary field'. Either `Column \"Capital\"` or a merge formula such as `{First name} & \" \" & {Last name}`. When you speak about a row, name it by this, never by its id. Empty when no table is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    group: "table_identity",
    sortOrder: 316,
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

  // ── Brief (board listing; on demand, never auto-context) ──────────────
  {
    name: "not_loaded_yet",
    label: "Not loaded yet",
    description:
      "True while the table's content has not loaded (a Board tile asleep or still reading): its row count, columns and permissions are then unknown, not zero or read-only. Absent once loaded.",
    valueType: "boolean",
    alwaysAvailable: false,
    autoContext: false,
    typicalCharCount: 4,
    group: "table_identity",
    sortOrder: 317,
  },
  {
    name: "brief_columns",
    label: "Column names (brief)",
    description:
      "The column headers as one short line, in display order (\"Item, Room, Quantity\"). The compact form a board lists this table by; column_list is the full schema.",
    valueType: "string",
    alwaysAvailable: false,
    autoContext: false,
    typicalCharCount: 80,
    group: "table_structure",
    sortOrder: 319,
  },
  {
    name: "brief_first_rows",
    label: "First rows (brief)",
    description:
      "The first one to three rows as short text, one row per ' | ' (\"Item: Boxes, Room: Kitchen | Item: Lamp, Room: Hall\"), empty cells left out. The compact form a board lists this table by; visible_data_csv is the page.",
    valueType: "string",
    alwaysAvailable: false,
    autoContext: false,
    typicalCharCount: 160,
    group: "table_data",
    sortOrder: 419,
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
      "Array of `{ name, display_name, type, required, order, format?, choices?, validation? }` for every column, in display order. `name` is the MACHINE field name (what a cell write must send); `display_name` is the header the user sees. `format` is the column's display meaning when the storage type alone would mislead — a `percent` column typed `number` holding 45 means 45%, not 0.45. `choices` lists the options a choice column offers; a value outside them is still accepted and simply flagged, but prefer an existing option over inventing one. `choice_labels` (present only when they differ from the values — a `person` column stores user ids and shows names) maps each choice VALUE to what the user reads; a write sends the value, never the label. `validation` lists the column's validation RULES in plain English (`At least 0`, `###-#### pattern`, `One of: Red, Green`, `Unique across rows`) — unlike `choices` these are ENFORCED: a cell_value write that breaks one is refused with the reason, so read them before writing rather than discovering them by failing. Absent on a column that constrains nothing. Empty array when no table is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 500,
    group: "table_structure",
    sortOrder: 325,
  },

  // ── Active selection (340-369) ────────────────────────────────────────
  {
    name: "row_actions",
    label: "Row actions",
    description:
      "The one-click buttons this table's owner defined on every row, as `{ id, name, kind, description }`: kind `update` applies fixed changes (the description says which — `Sets Status to \"AVAILABLE\"; clears Total; calculates Reset date.`), kind `agent` sends the row to an agent with a prompt. The user runs them from the row; you cannot trigger one, but when the user asks for exactly what an action does, say that the button exists. Present only when the table has actions.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    group: "table_structure",
    sortOrder: 338,
  },
  {
    name: "current_cell_value",
    label: "Current cell value",
    description:
      "Value of the current cell, stringified. The current cell is the one the user has SELECTED on the grid (a single click, or the arrow keys — the cell with the ring) or, when the full-content editor is open, that editor's draft. Empty when no cell is selected and no editor is open.",
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
      "MACHINE field name of the column containing the current (selected or open) cell — the same value a cell write sends as `field_name`, not the display header. Empty when no cell is selected or open.",
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
      "UUID of the row containing the current cell, or whose row editor is open. Empty when no cell is selected and no editor is open.",
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
      "The row named by `current_row_id` as a JSON object keyed by machine field name. Empty object when no row is current.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 600,
    group: "active_selection",
    sortOrder: 355,
  },

  {
    name: "selected_range_tsv",
    label: "Selected cells (TSV)",
    description:
      "The block of cells the user has selected on the grid — shift-click, drag, shift+arrows, a whole row or column, or select-all — as tab-separated rows whose FIRST line is the machine field names of the columns spanned. Present only when the selection covers more than one cell (a single selected cell is current_cell_value). This is what \"these cells\" means when the user points at part of the table.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    group: "active_selection",
    sortOrder: 360,
  },
  {
    name: "selected_range_cell_count",
    label: "Selected cell count",
    description:
      "How many cells selected_range_tsv spans. Present only alongside it.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "active_selection",
    sortOrder: 362,
  },
  {
    name: "current_row_label",
    label: "Current row label",
    description:
      "What the current row is CALLED, by the table's row label rule — the name to use for it in a sentence. Present only alongside current_row_id.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "active_selection",
    sortOrder: 353,
  },
  {
    name: "selected_rows_json",
    label: "Selected rows",
    description:
      "The rows the user ticked with the row checkboxes, as an array of `{ row_id, ...cells }` objects keyed by machine field name — the same shape as full_table_json. Present only while at least one row is ticked. Rows may span several pages; every ticked row is included, not just the visible page.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    group: "active_selection",
    sortOrder: 365,
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
 *    metadata — nothing downstream computes on it. It persists through
 *    records-ui's `saveTableDescription` (the table's own record, version-checked), which changes only
 *    the description, so it cannot disturb the table's name or its columns.
 *  - `cell_value` is the operation this surface exists for ("clean this
 *    value", "reformat this date", "fill in the category"). It is ONE cell,
 *    identified by an explicit `{row_id, field_name}` pair the agent must have
 *    READ off the page, and it lands through the data seam's `upsertCell` —
 *    one cell, which structurally cannot touch another cell, another row, or
 *    the column definitions (`custom.record_update`; lane INTEG-CLIENTS,
 *    CUTOVER-PLAN F15). The store's own row history makes it revertible.
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
 *    is a migration wearing a form's clothes: a retype rewrites
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
      "Sets the open table's description — the short prose that says what this table holds and what it is for. Value is PLAIN TEXT, not JSON and not JSON-encoded: send the sentence itself, with no surrounding quotes and no escaped newlines. Replaces the existing description in full, so include anything from table_description worth keeping; read that value first. 1-3 sentences is right (hard limit 2000 characters, refused above it) and an empty or whitespace-only value is refused — clearing the description is the user's call, not an agent's. Persists immediately on confirm through the table's own record (`custom.record_update` on the Table, version-checked, so a colleague's change since is refused, never overwritten), which changes ONLY the description: the table's name, columns and other settings are left untouched. Refused when is_read_only is true.",
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
  client: "matrx-user",
  executor: MATRX_WEB_APP_EXECUTOR,
  executionMode: "python-stream",
  description:
    "Tables and spreadsheet views",
  readiness: "partial",
  readinessNote:
    "Emitter + write handler: RecordStoreTableSurface over the one table page (UnifiedTableBody) — /data/[tableId] and every host that mounts it (table window, chat view-table modal, canvas table, Quick Data, Board tile), enabled with the merged grid (data_tables.merged_grid knob, platform default On). The merged grid reports cell / block / ticked rows / rows on screen through onGridContext; one confirmed cell write, or the table's description, goes through @ai-matrx/records. full_table_json has no Locate target: the grid renders only the current page. Partial until surface certification runs. The /data home emits nothing by design (no authored table state).",
  label: "Data Tables",
  urlPattern: "/data/[tableId]",
  intro: `<surface_intro>
You are on the Data Tables surface: the user is looking at one of their tables, at /data/[tableId] or opened in a window — a paginated grid with search, per-column filters, sorting, inline per-cell editing and per-row history.
table_id / table_name / table_description identify the table; row_label_rule says how the user names a row (a column, or a merge formula) — refer to rows by that name, never by id, and current_row_label carries it for the current row. row_actions lists the owner's one-click buttons on a row; you cannot press one. table_schema and column_list are its columns; column_list's \`name\` is the MACHINE field name every write uses, and \`display_name\` is the header the user reads — never send a display name where a field name is wanted.
The row bodies are visible_data_csv (the page on screen, whose first CSV column is row_id) and, when the viewer has already loaded it, full_table_json. row_count is the total after the user's search. search_term is the user's own filter — read it to know why rows are missing.
current_cell_value / current_column_name / current_row_id / current_row_json describe the cell the user has SELECTED on the grid (one click, or the arrow keys) or the cell / row whose editor is open, and are empty when nothing is selected or open. "This cell" or "the cell I'm on" means that selection. When the user selected a BLOCK of cells (shift-click, drag, a row, a column), selected_range_tsv carries it with a header line of machine field names and selected_range_cell_count says how big it is — "these cells" means that block. selected_rows_json carries the rows ticked with the row checkboxes — "these rows" / "the selected rows" means those.
This is the user's real data. You may write ONE cell at a time with cell_value, naming the row and column explicitly from what you have READ, and only for a row on the page currently on screen — that is what lets the user see the change land. You may write table_description. Everything else is theirs: columns and types are a migration that can destroy values, whole-table and whole-row replacement is unreviewable, deletes are human, and search_term is their filter.
is_read_only tells you whether you may write at all; on a shared table you can read but every write is refused.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
  // Which table, at a glance: its name, how many rows, its columns.
  // column_list is NOT here: a brief projects a list to its count, so the agent would read "7 columns"
  // with no names. brief_columns / brief_first_rows are short text, so names and the first rows survive.
  briefValues: ["table_name", "brief_columns", "row_count", "brief_first_rows"],
  writeTargets,
  // THE TWO FIXED AI JOBS this surface already runs — disclosed in the top
  // Agents menu only (agent-disclosure skill), never as page content. Both are
  // MANDATES (the Holder is DB-owned and moves without a deploy); both are
  // seeded on General Chat until Arman's vision sessions shape purpose-built
  // holders (register ARE-020 / ARE-021).
  agentRoles: [
    {
      name: "formula_writing",
      label: "Formula help",
      description:
        "Writes or fixes a formula from the formula box's \"Help with this…\", using this table's real columns and the formula language.",
      kind: "single",
      mandateKey: MANDATE_KEYS.data__formula_writing,
      defaultAgentId: null,
      autoRun: "never",
      sortOrder: 100,
    },
    {
      name: "row_action",
      label: "Row actions",
      description:
        "Runs one of this table's saved agent row actions on the row it was pressed for, with that row, the table and the person running it.",
      kind: "single",
      mandateKey: MANDATE_KEYS.data__row_action,
      defaultAgentId: null,
      autoRun: "never",
      sortOrder: 110,
    },
  ],
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
  /**
   * The column's DISPLAY format, when it has one — `percent`, `currency`,
   * `choice`, … Present because the storage type alone is a lie to whoever has
   * to write the cell: a `percent` column typed `number` holding `45` means
   * 45%, and an agent that cannot see the format cannot tell that from 0.45.
   */
  format?: string;
  /**
   * The values a `choice` / `multi_choice` column offers. A write outside this
   * list is not rejected — off-list values are legal and render in amber — but
   * an agent that can SEE the options has no reason to invent a new one.
   *
   * Omitted for a column bound to a pick list whose options have not loaded,
   * so an empty list never reads as "this column has no options".
   */
  choices?: string[];
  /**
   * How each choice VALUE reads to a person, when the two differ — a `person`
   * column stores user ids and shows names. Keys are entries of `choices`.
   * A write must send the VALUE (the key), never the label. Omitted when
   * values and labels are the same thing.
   */
  choice_labels?: Record<string, string>;
  /**
   * The column's VALIDATION RULES, in plain English — the same phrases the row
   * forms print under the input (`describeValidationRules`). Present because a
   * `cell_value` write that breaks one is REFUSED, and an agent that cannot see
   * the rule can only discover it by failing. Omitted when the column
   * constrains nothing.
   */
  validation?: string[];
}

export function createDataTablesScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  selected_range_tsv?: string;
  selected_range_cell_count?: number;
  selected_rows_json?: unknown[];
  table_id?: string;
  table_name?: string;
  table_description?: string;
  row_label_rule?: string;
  is_read_only?: boolean;
  table_schema?: Record<string, unknown>;
  column_list?: DataTableColumnEntry[];
  row_actions?: { id: string; name: string; kind: "update" | "agent"; description: string }[];
  row_count?: number;
  not_loaded_yet?: boolean;
  brief_columns?: string;
  brief_first_rows?: string;
  current_cell_value?: string;
  current_column_name?: string;
  current_row_id?: string;
  current_row_json?: Record<string, unknown>;
  current_row_label?: string;
  visible_data_csv?: string;
  full_table_json?: unknown[];
  search_term?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
