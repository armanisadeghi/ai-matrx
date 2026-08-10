/**
 * Surface manifest — Workbooks (`matrx-user/workbooks`).
 *
 * Drives `/workbooks` (the spreadsheet library, with XLSX/CSV and smart
 * import) and `/workbooks/[id]` (the Univer-backed workbook editor). Backed
 * by `features/data-tables/**` — `udt_workbooks` rows plus append-only
 * `udt_workbook_snapshots`, edited through `WorkbookEditor`.
 *
 * ONE surface covers library + editor, so almost nothing is
 * `alwaysAvailable`: the open workbook exists only on the `[id]` route, the
 * sheet/content values only once Univer has booted there, and the library
 * roster only on the list route.
 *
 * Runtime emitters (each mounts its own `<SurfaceRuntimeProvider>`):
 *   - `app/(core)/workbooks/page.tsx`            — library roster + counts +
 *     load status + smart-import detection
 *   - `app/(core)/workbooks/[id]/page.tsx`       — open-workbook identity and
 *     permissions; content/editor-state values are read at trigger time from
 *     the live editor via `features/data-tables/workbook-scope-source.ts`,
 *     which `WorkbookEditor` registers while mounted.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "workbook_library",
    label: "Workbook library",
    sortOrder: 100,
    description:
      "Every workbook the user can open, as listed on /workbooks. Empty on the editor route.",
  },
  {
    key: "open_workbook",
    label: "Open workbook",
    sortOrder: 200,
    description:
      "Identity, provenance and permissions of the workbook open at /workbooks/[id]. Empty on the library route.",
  },
  {
    key: "workbook_content",
    label: "Workbook content",
    sortOrder: 300,
    description:
      "Sheets, the active sheet, and the live Univer snapshot of the open workbook. Only populated once the editor has booted.",
  },
  {
    key: "workbook_editor_state",
    label: "Editor state",
    sortOrder: 400,
    description:
      "What the editor is doing right now — boot state, save status, collaboration presence — and the library route's import machinery.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Workbook library ──────────────────────────────────────────────────
  {
    group: "workbook_library",
    name: "workbooks_summary",
    label: "Workbooks summary",
    description:
      "One entry per accessible workbook: id, name, description, source (created | imported_xlsx | imported_csv | …), is_public, version and updated_at. Empty while the library is loading, when the fetch failed, when the user has no workbooks, or on the editor route.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1800,
    autoContext: false,
    sortOrder: 300,
  },
  {
    group: "workbook_library",
    name: "workbooks_count",
    label: "Workbook count",
    description:
      "How many workbooks the library listed. Zero when the user has none; empty while loading, on a failed fetch, or on the editor route.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 310,
  },
  {
    group: "workbook_library",
    name: "workbooks_load_status",
    label: "Library load status",
    description:
      "State of the library fetch as the page sees it: { loading, error }. Empty on the editor route.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 320,
  },

  // ── Open workbook ─────────────────────────────────────────────────────
  {
    group: "open_workbook",
    name: "workbook_id",
    label: "Open workbook ID",
    description:
      "UUID of the workbook open at /workbooks/[id]. Empty on the library route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 400,
  },
  {
    group: "open_workbook",
    name: "workbook_name",
    label: "Workbook name",
    description:
      "Name of the open workbook — the editable value in the header, so it reflects the last committed rename. Empty on the library route or while the row is loading.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 410,
  },
  {
    group: "open_workbook",
    name: "workbook_description",
    label: "Workbook description",
    description:
      "Description stored on the open workbook (import flows write \"Imported from <file>\" here). Empty when it has none, or on the library route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 420,
  },
  {
    group: "open_workbook",
    name: "workbook_source",
    label: "Workbook source",
    description:
      "How the open workbook came to exist (created | imported_xlsx | imported_csv | …). Empty on the library route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 14,
    sortOrder: 430,
  },
  {
    group: "open_workbook",
    name: "workbook_updated_at",
    label: "Workbook updated at",
    description:
      "ISO timestamp of the last persisted change to the open workbook row. Empty on the library route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 440,
  },
  {
    group: "open_workbook",
    name: "workbook_permissions",
    label: "Workbook permissions",
    description:
      "What this user may do with the open workbook: { is_owner, can_edit, is_public }. can_edit is resolved from ownership or the has_permission RPC BEFORE the editor mounts, so a false value means the editor is in viewer-only mode. Empty on the library route.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 70,
    sortOrder: 450,
  },
  {
    group: "open_workbook",
    name: "open_workbook",
    label: "Open workbook record",
    description:
      "The whole open workbook row as one object (id, name, description, source, version, is_public, original_file_id, created_at, updated_at) — the composite of this group's individual values. Empty on the library route.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 500,
    autoContext: false,
    sortOrder: 460,
  },

  // ── Workbook content ──────────────────────────────────────────────────
  {
    group: "workbook_content",
    name: "workbook_sheets",
    label: "Sheets",
    description:
      "One entry per sheet in the open workbook: { id, name, index }, in sheet order. Empty on the library route and until Univer has booted the workbook.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 250,
    sortOrder: 500,
  },
  {
    group: "workbook_content",
    name: "active_sheet_id",
    label: "Active sheet ID",
    description:
      "Univer sheet id of the sheet the user is currently on. Empty on the library route and until the editor has booted.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    sortOrder: 510,
  },
  {
    group: "workbook_content",
    name: "active_sheet_name",
    label: "Active sheet name",
    description:
      "Display name of the sheet the user is currently on. Empty on the library route and until the editor has booted.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 520,
  },
  {
    group: "workbook_content",
    name: "workbook_snapshot",
    label: "Workbook snapshot",
    description:
      "The live Univer IWorkbookData snapshot of the open workbook — every sheet's cell data as it stands in the browser, including unsaved edits. Large; bindable but never auto-shipped. Empty on the library route and until the editor has booted.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 20000,
    autoContext: false,
    sortOrder: 530,
  },

  // ── Editor state ──────────────────────────────────────────────────────
  {
    group: "workbook_editor_state",
    name: "workbook_editor_status",
    label: "Editor status",
    description:
      "Univer boot state of the open workbook: booting | ready | load_error, with the load error when it failed. Empty on the library route and before the editor mounts.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 600,
  },
  {
    group: "workbook_editor_state",
    name: "workbook_save_status",
    label: "Save status",
    description:
      "Autosave state of the open workbook: idle | dirty | saving | saved | error. \"dirty\" means edits are pending the 2.5s debounce. Empty on the library route and before the editor mounts.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 610,
  },
  {
    group: "workbook_editor_state",
    name: "workbook_collab",
    label: "Collaboration state",
    description:
      "Live collaboration state of the open workbook: { enabled, is_host, self_uid, remote_peers }. Empty on the library route and before the editor mounts.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 620,
  },
  {
    group: "workbook_editor_state",
    name: "workbook_import_state",
    label: "Import state",
    description:
      "The library route's in-flight import machinery: { creating, importing, smart_dialog_open, smart_file_name, detection } where detection is the smart-importer's route analysis of the picked file. Empty when no import is in progress, and on the editor route.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    autoContext: false,
    sortOrder: 630,
  },
];

/**
 * Write half of the 360 loop. This surface spans TWO provider mounts and they
 * get DIFFERENT postures on purpose — one manifest, one target list, but
 * `listAgentWritableTargets()` only offers a target where that mount actually
 * registered a handler, so per-mount registration is what splits them.
 *
 * **The library route (`app/(core)/workbooks/page.tsx`) registers NOTHING —
 * deliberately.** It is a roster of N workbooks with no open record, and a
 * write target carries ONE value with no entity selector: "set the
 * description" there has no addressable subject. Its only mutations are
 * create (a creation action, not a field write), import (needs a `File` an
 * agent cannot supply) and delete (destructive, human-only). Read-only is the
 * correct posture for that mount, not an oversight.
 *
 * **The editor route (`app/(core)/workbooks/[id]/page.tsx`) owns the two
 * entity targets** — `workbook_name` and `workbook_description`, the pair of
 * human-authored fields on `udt_workbooks`. Both persist immediately through
 * the canonical `workbook-service` setters (`renameWorkbook` /
 * `updateWorkbookDescription`) — never a direct `.from("udt_workbooks")`
 * write. They are `entity` rather than the usually-preferred `draft` for the
 * same reason `schedule_title` is on `ScheduleDetail`: this route has no Save
 * bar. The header's rename field commits only on blur/Enter, so a staged
 * draft value would sit in an input the user may never focus and be lost on
 * navigation — the write must land or not happen at all.
 *
 * **`WorkbookEditor` (the deep child that owns Univer) registers
 * `workbook_sheet_names`** via `useSurfaceWriteHandlers`, because the sheets
 * live inside the editor instance, not on the page. It is `draft`: renaming
 * through `FWorksheet.setName()` fires the SAME Univer command the user's own
 * sheet-tab rename fires, so it flows through `onCommandExecuted` →
 * `isSnapshotMutation` → dirty → the editor's 2.5s debounced autosave, and
 * Univer's own undo reverses it.
 *
 * All three are `applyPolicy: "ask"` — a workbook is the user's data, so
 * every agent-originated change is confirmed in place.
 *
 * Deliberately NOT agent-writable anywhere on this surface:
 *   - `workbook_snapshot` — bulk-replacing every cell of a user's spreadsheet
 *     is destructive, not authoring, and there is no single canonical
 *     "overwrite the grid" gesture to route it through. Agents read the
 *     snapshot and tell the user what to change.
 *   - `workbook_permissions` / `is_public` — permissions and visibility.
 *   - `workbook_id` / `workbook_source` — identity and provenance.
 *   - deleting a workbook or a sheet, and adding/reordering sheets — the
 *     destructive and structural edits stay human.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "workbook_name",
    label: "Workbook name",
    description:
      "Renames the workbook open at /workbooks/[id] and saves it immediately through the canonical rename path; the header name field updates in place. Plain string, 1-200 characters, replacing the whole name — read workbook_name first if you mean to extend it rather than replace it. Renames only the file; it does not touch any sheet name or any cell. Refused when the user only has viewer access.",
    valueType: "string",
    updatesValue: "workbook_name",
    mode: "entity",
    applyPolicy: "ask",
    group: "open_workbook",
    sortOrder: 100,
  },
  {
    name: "workbook_description",
    label: "Workbook description",
    description:
      "Rewrites the open workbook's description and saves it immediately through the canonical update path — this is the blurb shown under the workbook's name in the /workbooks library. Plain string up to 2000 characters; replaces the FULL text, so read workbook_description first if you mean to extend it, and pass an empty string to clear it. Refused when the user only has viewer access.",
    valueType: "string",
    updatesValue: "workbook_description",
    mode: "entity",
    applyPolicy: "ask",
    group: "open_workbook",
    sortOrder: 110,
  },
  {
    name: "workbook_sheet_names",
    label: "Sheet names",
    description:
      'Renames one or more sheets of the open workbook in the live editor. Value is an object keyed by SHEET ID with the new name as the value, e.g. { "sheet-01": "Q3 Revenue", "sheet-02": "Assumptions" } — read workbook_sheets first to get the ids. This is a PARTIAL map, not a full replacement: sheets you leave out keep their current names, and it can never add, delete or reorder a sheet. Each name must be 1-31 characters, must not contain any of : \\ / ? * [ ], and must be unique across the workbook once every rename in the map is applied. Invalid or unknown-id entries are rejected and NOTHING is renamed. The rename lands in the editor like your own tab rename and is persisted by the editor\'s autosave a couple of seconds later; Undo reverses it. Refused when the user only has viewer access or the editor has not finished booting.',
    valueType: "object",
    updatesValue: "workbook_sheets",
    mode: "draft",
    applyPolicy: "ask",
    group: "workbook_content",
    sortOrder: 120,
  },
];

export const workbooksManifest: SurfaceManifest = {
  surfaceName: "matrx-user/workbooks",
  readiness: "partial",
  readinessNote:
    "Manifest + emitters (library page, editor page, live content source registered by WorkbookEditor) are wired and every value the routes load is declared. Not yet verified: DB sync (ui_surface row + manifest sync), route-prefix mapping in utils/route-to-surface.ts, data-surface-value anchors for Locate, and a live non-matching-name binding test.",
  label: "Workbooks",
  urlPattern: "/workbooks",
  intro: `<surface_intro>
You are in the user's spreadsheet workbooks: a library of workbooks at /workbooks and a full Univer spreadsheet editor at /workbooks/[id]. Workbooks are created empty, imported from XLSX/CSV, or shared with the user; the editor autosaves append-only snapshots and can run live collaboration.
Two routes share this surface. On the library only the workbook_library group and workbook_import_state are populated. On the editor route the open-workbook group identifies the file, workbook_sheets / active_sheet_id / active_sheet_name describe where the user is, workbook_snapshot carries the live cell data including unsaved edits, and the editor-state values say whether it is still booting, saving, or in a collaborative session. Absent values are normal, not an error.
Respect permissions: workbook_permissions.can_edit is resolved before the editor mounts and false means viewer-only — do not propose edits the user cannot make. Report cell values, sheet names and counts strictly from workbook_snapshot; never invent a cell, a formula result, or a sheet.
workbook_snapshot is the whole workbook and can be very large — it is bindable but not auto-attached. Ask for the sheet you need rather than assuming the entire grid is in context.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * No value is `alwaysAvailable`: one surface spans the library route and the
 * editor route, and the editor's own values only exist after Univer boots.
 */
export function createWorkbooksScope(values: {
  workbooks_summary?: Array<Record<string, unknown>>;
  workbooks_count?: number;
  workbooks_load_status?: Record<string, unknown>;
  workbook_id?: string;
  workbook_name?: string;
  workbook_description?: string;
  workbook_source?: string;
  workbook_updated_at?: string;
  workbook_permissions?: Record<string, unknown>;
  open_workbook?: Record<string, unknown>;
  workbook_sheets?: Array<Record<string, unknown>>;
  active_sheet_id?: string;
  active_sheet_name?: string;
  workbook_snapshot?: Record<string, unknown>;
  workbook_editor_status?: Record<string, unknown>;
  workbook_save_status?: string;
  workbook_collab?: Record<string, unknown>;
  workbook_import_state?: Record<string, unknown>;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
