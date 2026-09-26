/**
 * Surface manifest — Table settings (`matrx-user/table-settings`).
 *
 * The data table's settings window (`TableConfigModal`: Fields & Order, Table
 * Settings, Actions) — a LAYER over `matrx-user/data-tables`. It is the
 * worked example of the surface chain (register
 * `common-docs/projects/ai-reachable-everywhere`, ARE-010 / ARE-011):
 *
 *   - While it is open it is the primary surface (it renders inside a
 *     `SurfaceLayerBoundary`), so the Agents menu, right-click AI and the
 *     assist dock speak for THIS window.
 *   - The table itself is NOT re-declared here. The data table's own provider
 *     is still mounted under the window, so its values (the table, its
 *     columns, the rows on screen, the selected cell) reach the agent as a
 *     `page` level of the surface chain — this manifest owns only what the
 *     settings window alone can see. That is the family doctrine applied at
 *     run time: the page conveys the container, the layer owns its layer.
 *   - Its root carries `data-surface-layer`, so the unregistered-window
 *     reader (`window-forms.ts`) leaves it to this surface.
 *
 * Emitter: `SurfaceRuntimeProvider` inside `TableConfigModal` (tab, pending
 * column/table edits); the Actions tab's `RowActionsEditor` contributes the
 * row-action values and owns both row-action write targets
 * (`useSurfaceScopeContribution` + `useSurfaceWriteHandlers`), because the
 * action being edited lives in its state.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";

export const TABLE_SETTINGS_SURFACE_NAME = "matrx-user/table-settings";

const groups: SurfaceValueGroup[] = [
  {
    key: "settings_window",
    label: "Settings window",
    sortOrder: 100,
    description: "Which tab is open and what is waiting to be saved.",
  },
  {
    key: "row_actions",
    label: "Row actions",
    sortOrder: 200,
    description: "The table's saved row actions and the one being edited.",
  },
];

const values: SurfaceValue[] = [
  {
    name: "settings_tab",
    label: "Open tab",
    description:
      "The tab the person has open: `fields` (Fields & Order — column names, types, formats, validation, order), `table` (Table Settings — name, description, row label, validation mode) or `actions` (row actions).",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 100,
    group: "settings_window",
  },
  {
    name: "has_unsaved_changes",
    label: "Unsaved changes",
    description:
      "True when the Fields & Order or Table Settings tab holds edits the person has not saved with Save Changes yet. Row actions save on their own and never count here.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 110,
    group: "settings_window",
  },
  {
    name: "pending_column_changes",
    label: "Pending column changes",
    description:
      "Column edits made in this window and not saved yet: `type_changes` (column → new data type), `format_changes` (column → new display format) and `validation_changes` (column → new validation rules), each keyed by the column's machine name. Absent when there are none.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 120,
    group: "settings_window",
  },
  {
    name: "table_details_draft",
    label: "Table details as edited",
    description:
      "The table's name, description and validation mode as they stand in this window, including unsaved edits.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 300,
    sortOrder: 130,
    group: "settings_window",
  },
  {
    name: "saved_row_actions",
    label: "Saved row actions",
    description:
      "Every row action the table already has: its id, button label, kind (`update` changes cells; `agent` hands the row to an agent), its steps or agent prompt, and a one-line sentence of what it does.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 200,
    group: "row_actions",
  },
  {
    name: "editing_row_action",
    label: "Row action being edited",
    description:
      "The row action open in the editor right now (new or existing, not saved until the person presses Save action): `id`, `name` (button label), `kind`, `steps` for an update action — each `{ field, set: \"value\" | \"clear\" | \"formula\", value?, expression? }` keyed by the column's machine name — or `prompt` for an agent action, plus `color`, `icon`, `confirm`, and `sentence` describing it. Absent when no action is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 210,
    group: "row_actions",
  },
  {
    name: "editing_row_action_problems",
    label: "What stops the action from saving",
    description:
      "Every reason the open row action cannot be saved yet, in the words the person sees (a missing name, a formula that does not parse, a column that does not exist). Empty when it can be saved.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 220,
    group: "row_actions",
  },
  {
    name: "formula_language",
    label: "Formula language",
    description:
      "The formula language a Calculate step is written in: every function with its signature and meaning, the operators, and how columns are referenced (`{Display name}`). Present while an update action is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    sortOrder: 230,
    group: "row_actions",
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "editing_row_action",
    label: "Row action being edited",
    description:
      'Replace the row action open in the editor — or open a new one when none is — with a whole action: { "name": "<button label>", "kind": "update", "steps": [{ "field": "<column machine name>", "set": "value", "value": … } | { "field": …, "set": "clear" } | { "field": …, "set": "formula", "expression": "<formula>" }], "color"?: …, "icon"?: …, "confirm"?: bool } or { "name": …, "kind": "agent", "prompt": "<what the agent does with the row>" }. Checked exactly as the Save action button checks it (columns exist, formulas parse and reference real columns); nothing is saved until the person presses Save action.',
    valueType: "object",
    mode: "draft",
    applyPolicy: "ask",
    updatesValue: "editing_row_action",
    group: "row_actions",
    sortOrder: 100,
  },
  {
    name: "row_action_step_formula",
    label: "Formula for one step",
    description:
      'Write the formula of one Calculate step in the row action being edited: { "field": "<column machine name the result is written into>", "expression": "<formula>" }. Adds the step when that column has none, or turns its step into a Calculate step. The formula must parse and reference only real columns as {Display name}; see formula_language. Nothing is saved until the person presses Save action.',
    valueType: "object",
    mode: "draft",
    applyPolicy: "ask",
    group: "row_actions",
    sortOrder: 110,
  },
  {
    name: "table_details",
    label: "Table details",
    description:
      'Stage new table details in the Table Settings tab: { "table_name"?: "<name>", "description"?: "<text>", "validation_mode"?: "permissive" | "strict" }. Only the keys you send change. Nothing is saved until the person presses Save Changes.',
    valueType: "object",
    mode: "draft",
    applyPolicy: "ask",
    updatesValue: "table_details_draft",
    group: "settings_window",
    sortOrder: 112,
  },
  {
    name: "column_changes",
    label: "Column changes",
    description:
      'Stage changes to one or more columns in the Fields & Order tab: { "changes": [{ "column": "<machine name or display name>", "display_name"?: "<label>", "data_type"?: "string" | "number" | "integer" | "boolean" | "date" | "datetime" | "json" | "array", "is_required"?: true | false, "formula"?: "<formula, makes it a calculated column>" }] }. Every change is checked first (the column exists, the type is real, a formula parses and names real columns); one bad change stages nothing. Changing a data type converts existing values when the person saves. Nothing is saved until the person presses Save Changes.',
    valueType: "object",
    mode: "draft",
    applyPolicy: "ask",
    updatesValue: "pending_column_changes",
    group: "settings_window",
    sortOrder: 114,
  },
  {
    name: "settings_tab",
    label: "Open tab",
    description:
      'Switch the settings window to another tab: "fields", "table" or "actions".',
    valueType: "string",
    mode: "ui",
    applyPolicy: "auto",
    updatesValue: "settings_tab",
    group: "settings_window",
    sortOrder: 120,
  },
];

export const tableSettingsManifest: SurfaceManifest = {
  surfaceName: TABLE_SETTINGS_SURFACE_NAME,
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "The data table's settings window: columns, table details and row actions.",
  label: "Table Settings",
  readiness: "partial",
  readinessNote:
    "Emitter and write targets wired 2026-09-26 (the surface-chain worked example): row actions, table details, column label/type/required/formula. Not agent-writable yet: column display formats other than formula, validation rules and column order.",
  intro: `<surface_intro>
You are in the Table settings window of one of the person's data tables. The table itself (its columns, the rows on screen, the selected cell) is in the surface chain as the page under this window — read it there. This window adds what only it can see: which tab is open, edits not saved yet, the table's row actions, and the row action being edited, with every reason it cannot be saved yet.

A row action is a button on every row. An update action sets, clears or calculates cells; a Calculate step writes the result of a formula into one column, evaluated against the row as it is before the action runs. When the person asks for a formula, write it with row_action_step_formula using formula_language and the table's real column names — never invent a column. Nothing you stage is saved until the person presses Save action.
</surface_intro>`,
  groups,
  values,
  writeTargets,
  skipBaselineValues: true,
};

/** Type-safe payload for the window's own provider (`TableConfigModal`). */
export function createTableSettingsScope(values: {
  settings_tab: string;
  has_unsaved_changes: boolean;
  table_details_draft: Record<string, unknown>;
  pending_column_changes?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}

/** Type-safe payload for the Actions tab's contribution (`RowActionsEditor`). */
export function createTableSettingsRowActionsScope(values: {
  saved_row_actions?: unknown[];
  editing_row_action?: Record<string, unknown>;
  editing_row_action_problems?: string[];
  formula_language?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
