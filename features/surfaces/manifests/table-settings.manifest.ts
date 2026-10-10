/**
 * Surface manifest — Table settings (`matrx-user/table-settings`).
 *
 * The table's settings panel on the store grid (records-ui `TableSettings`: About this table,
 * the columns, row actions) — a LAYER over `matrx-user/data-tables`. It is the worked example of
 * the surface chain (register
 * `common-docs/systems/platform/ui-shell/projects/ai-reachable-everywhere`, ARE-010 / ARE-011):
 *
 *   - While it is open it is the primary surface (it renders inside a
 *     `SurfaceLayerBoundary`), so the Agents menu, right-click AI and the
 *     assist dock speak for THIS panel.
 *   - The table itself is NOT re-declared here. The table page's own provider
 *     is still mounted under the panel, so its values (the table, its
 *     columns, the rows on screen, the selected cell) reach the agent as a
 *     `page` level of the surface chain — this manifest owns only what the
 *     settings panel alone can see.
 *   - Its root carries `data-surface-layer`, so the unregistered-window
 *     reader (`window-forms.ts`) leaves it to this surface.
 *
 * Emitter: records-ui's `settingsAgent` port, bound in
 * `features/data-tables/records-ui-host/recordsAgentPorts.tsx`. The package hands a
 * `TableSettingsAgent` — what the panel shows (the description as edited, the row actions and
 * the one open in the editor, what stops it saving) and three staging calls. Staging fills the
 * panel exactly as if typed; nothing is saved until the person presses Save. (The older Sheet's
 * settings window also staged column changes and switched tabs; the store grid's panel has no
 * tabs, and a column is changed in its own field panel, so neither is offered here.)
 */

import type {
  SurfaceManifest,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@ai-matrx/chat/surfaces/types";
import { MATRX_WEB_APP_EXECUTOR } from "@ai-matrx/chat/surfaces/executor";
import { TABLE_SETTINGS_SURFACE_NAME } from "./table-settings.surface";

const groups: SurfaceValueGroup[] = [
  {
    key: "settings_window",
    label: "Settings window",
    sortOrder: 100,
    description: "The table's details as edited and what is waiting to be saved.",
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
    name: "has_unsaved_changes",
    label: "Unsaved changes",
    description:
      "True when the description holds an edit not saved yet, or a row action is open in the editor and not saved with Save action yet.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 110,
    group: "settings_window",
  },
  {
    name: "table_details_draft",
    label: "Table details as edited",
    description:
      "The table's name, its description as it stands in the panel (including an unsaved edit) and its row label (the column that names each record).",
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
      'Stage the table\'s description in About this table: { "description": "<1-3 sentences, plain text>" }. Only `description` is staged here — the table is renamed from its menu and the row label is picked by the person. Nothing is saved until the person presses Save under the description.',
    valueType: "object",
    mode: "draft",
    applyPolicy: "ask",
    updatesValue: "table_details_draft",
    group: "settings_window",
    sortOrder: 112,
  },
];

export const tableSettingsManifest: SurfaceManifest = {
  surfaceName: TABLE_SETTINGS_SURFACE_NAME,
  client: "matrx-user",
  executor: MATRX_WEB_APP_EXECUTOR,
  executionMode: "python-stream",
  description:
    "The data table's settings window: columns, table details and row actions.",
  label: "Table Settings",
  readiness: "partial",
  readinessNote:
    "Fed by records-ui's settings panel through the `settingsAgent` port (2026-10-07, Sheet retirement): the description as edited, row actions and the one being edited, with what stops it saving. Agent-stageable: a whole row action, one Calculate step's formula, the description. Not offered: column changes (each column has its own field panel) and table rename (its menu).",
  intro: `<surface_intro>
You are in the settings panel of one of the person's data tables. The table itself (its columns, the rows on screen, the selected cell) is in the surface chain as the page under this panel — read it there. This panel adds what only it can see: the description as edited, edits not saved yet, the table's row actions, and the row action being edited, with every reason it cannot be saved yet.

A row action is a button on every row. An update action sets, clears or calculates cells; a Calculate step writes the result of a formula into one column, evaluated against the row as it is before the action runs. When the person asks for a formula, write it with row_action_step_formula using formula_language and the table's real column names — never invent a column. Nothing you stage is saved until the person presses Save action.
</surface_intro>`,
  groups,
  values,
  writeTargets,
  skipBaselineValues: true,
};
