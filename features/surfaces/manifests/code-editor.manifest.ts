/**
 * Surface manifest — Code editor (`matrx-user/code-editor`).
 *
 * The Monaco-based code editor used in the `/code` workspace and embedded in
 * agent builder / code workspace screens. Multi-file with tabs, per-file
 * dirty state, syntax highlighting by language, cursor + selection, and live
 * lint / type-check diagnostics from Monaco markers.
 *
 * Agents bound here typically operate on a file (refactor, explain,
 * translate to another language), a selection (rewrite this block,
 * generate tests for this function), across the open workspace
 * (find duplicated logic, suggest a shared helper), or on the diagnostics
 * (explain this error, fix all lint failures).
 *
 * Runtime emission lives in
 * `features/code/agent-context/buildCodeWorkspaceContextData.ts` — shared by
 * the `/code` workspace menus (`CodeWorkspaceContextMenu`,
 * `CodeReadonlyContextMenu`) and the embedded `CodeEditorContextMenu`. The
 * builder also carries the legacy cross-editor `vsc_*` key contract for old
 * Shortcuts — those are aliases of declared values, not surface values.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import {
  mergeBaselineValues,
  pickBaseline,
} from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "active_file",
    label: "Active file",
    sortOrder: 100,
    description: "The file currently focused in the editor.",
  },
  {
    key: "cursor_selection",
    label: "Cursor & selection",
    sortOrder: 200,
    description: "Where the caret sits and what the user has selected.",
  },
  {
    key: "workspace",
    label: "Workspace",
    sortOrder: 300,
    description: "The open tab set and the filesystem the editor is mounted on.",
  },
  {
    key: "diagnostics",
    label: "Diagnostics",
    sortOrder: 400,
    description: "Live lint / type-check markers from the editor.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Active file identity & body ───────────────────────────────────────
  {
    name: "current_file_path",
    label: "Active file path",
    description:
      "Path of the file currently in focus. Empty when no file is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 300,
    group: "active_file",
  },
  {
    name: "current_file_language",
    label: "Active file language",
    description:
      "Language id (e.g. `typescript`, `python`, `sql`) of the focused file. Empty when unknown or no file open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 310,
    group: "active_file",
  },
  {
    name: "current_file_content",
    label: "Active file content",
    description:
      "Full text of the file currently in focus. Can be large — binding UIs warn at ~50KB. Empty when no file is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    sortOrder: 320,
    group: "active_file",
  },
  {
    name: "current_file_modified",
    label: "Active file modified",
    description:
      "True when the focused file has unsaved edits. False when clean; absent when no file is open.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 325,
    group: "active_file",
  },
  {
    name: "current_file_line_count",
    label: "Active file line count",
    description:
      "Total number of lines in the focused file's buffer. Absent when no file is open or the buffer is empty.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 330,
    group: "active_file",
  },

  // ── Cursor + selection ────────────────────────────────────────────────
  {
    name: "current_line_number",
    label: "Current line number",
    description:
      "1-indexed line number where the caret currently sits. Absent when no caret position is known.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 340,
    group: "cursor_selection",
  },
  {
    name: "current_column_number",
    label: "Current column number",
    description:
      "1-indexed column number where the caret currently sits. Absent when no caret position is known.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 345,
    group: "cursor_selection",
  },
  {
    name: "selection_range",
    label: "Selection range",
    description:
      "Object describing the current selection: `{ startLine, startColumn, endLine, endColumn }`. Absent when nothing is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 350,
    group: "cursor_selection",
  },

  // ── Workspace state ───────────────────────────────────────────────────
  {
    name: "open_file_paths",
    label: "Open file paths",
    description:
      "Array of file paths currently open in editable tabs. Empty array when nothing is open. Always populated.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 400,
    sortOrder: 400,
    group: "workspace",
  },
  {
    name: "open_file_count",
    label: "Open file count",
    description:
      "Number of editable tabs currently open (derived; equivalent to `open_file_paths.length`). Always populated; zero when nothing is open.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 410,
    group: "workspace",
  },
  {
    name: "open_files",
    label: "Open files",
    description:
      "One entry per open editable tab: `{ path, name, language, modified }` — the composite of the open-tab metadata the tab strip renders. Empty array when nothing is open. Always populated.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 600,
    sortOrder: 415,
    group: "workspace",
  },
  {
    name: "modified_file_paths",
    label: "Modified file paths",
    description:
      "Array of file paths with unsaved edits across all open tabs. Absent when everything is saved.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 420,
    group: "workspace",
  },
  {
    name: "workspace_root",
    label: "Workspace root path",
    description:
      "Root path of the active filesystem the editor is mounted on. Absent in embedded editors or before a filesystem is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 430,
    group: "workspace",
  },
  {
    name: "filesystem_id",
    label: "Active filesystem id",
    description:
      "Adapter id of the active filesystem, `${kind}:${instanceId}` (e.g. `sandbox:abc123`, `agent-fs:...`). Absent in embedded editors or before a filesystem is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 440,
    group: "workspace",
  },
  {
    name: "filesystem_label",
    label: "Active filesystem label",
    description:
      "Human-friendly label of the active filesystem shown in the workspace picker. Absent in embedded editors or before a filesystem is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 445,
    group: "workspace",
  },

  // ── Diagnostics ───────────────────────────────────────────────────────
  {
    name: "active_file_diagnostics",
    label: "Active file diagnostics",
    description:
      "Monaco lint / type-check markers for the focused file: one entry per marker with severity, message, source, code, and start/end line+column. Empty array when the file is clean. Always populated.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 800,
    sortOrder: 500,
    group: "diagnostics",
  },
  {
    name: "workspace_diagnostics",
    label: "Workspace diagnostics",
    description:
      "All known diagnostics keyed by tab id / file path across the open workspace (same marker shape as active_file_diagnostics). Empty object when everything is clean. Always populated.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 1500,
    autoContext: false,
    sortOrder: 510,
    group: "diagnostics",
  },
];

export const codeEditorManifest: SurfaceManifest = {
  surfaceName: "matrx-user/code-editor",
  label: "Code Editor",
  urlPattern: "/code",
  intro: `<surface_intro>
You are on the Code editor surface: a Monaco-based multi-file editor (the /code workspace, or an embedded editor inside another screen).
Read current_file_path / current_file_language / current_file_content for the focused file, current_line_number / selection_range (plus the baseline selection / text_before / text_after) for where the user is working, and open_files / modified_file_paths for the wider tab set. active_file_diagnostics carries live lint and type-check markers — when asked to fix or explain errors, work from these instead of guessing.
The baseline content value is the full text of the active file. When the surface is editable, your text output can be applied directly back into the buffer (replace selection / insert), so return clean code without commentary unless asked to explain.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "text_before", "text_after", "content", "context"),
    surfaceSpecific,
  ),
};

/** One open editable tab as emitted in the `open_files` surface value. */
export interface CodeOpenFileEntry {
  path: string;
  name: string;
  language: string;
  modified: boolean;
}

/** One Monaco marker as emitted in the diagnostics surface values. */
export interface CodeDiagnosticEntry {
  severity: "error" | "warning" | "info" | "hint";
  message: string;
  source?: string;
  code?: string | number;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
}

export function createCodeEditorScope(values: {
  // alwaysAvailable: true → required
  open_file_paths: string[];
  open_file_count: number;
  open_files: CodeOpenFileEntry[];
  active_file_diagnostics: CodeDiagnosticEntry[];
  workspace_diagnostics: Record<string, CodeDiagnosticEntry[]>;
  // alwaysAvailable: false → optional
  selection?: string;
  text_before?: string;
  text_after?: string;
  content?: string;
  context?: Record<string, unknown>;
  current_file_path?: string;
  current_file_language?: string;
  current_file_content?: string;
  current_file_modified?: boolean;
  current_file_line_count?: number;
  current_line_number?: number;
  current_column_number?: number;
  selection_range?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  modified_file_paths?: string[];
  workspace_root?: string;
  filesystem_id?: string;
  filesystem_label?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
