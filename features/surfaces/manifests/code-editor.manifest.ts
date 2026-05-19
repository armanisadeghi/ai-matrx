/**
 * Surface manifest — Code editor (`matrx-user/code-editor`).
 *
 * The Monaco-based code editor used in standalone routes and embedded in
 * agent builder / code workspace screens. Multi-file with tabs, per-file
 * dirty state, syntax highlighting by language, cursor + selection.
 *
 * Agents bound here typically operate on a file (refactor, explain,
 * translate to another language), a selection (rewrite this block,
 * generate tests for this function), or across the open workspace
 * (find duplicated logic, suggest a shared helper).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import {
  mergeBaselineValues,
  pickBaseline,
} from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  // ── Active file identity & body (300-339) ─────────────────────────────
  {
    name: "current_file_path",
    label: "Active file path",
    description:
      "Path of the file currently in focus. Empty when no file is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 300,
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
  },
  {
    name: "current_file_content",
    label: "Active file content",
    description:
      "Full text of the file currently in focus. Can be large — binding UIs warn at ~50KB.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    sortOrder: 320,
  },
  {
    name: "current_file_modified",
    label: "Active file modified",
    description:
      "True when the focused file has unsaved edits. False when clean or no file is open.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 325,
  },

  // ── Cursor + selection (340-369) ──────────────────────────────────────
  {
    name: "current_line_number",
    label: "Current line number",
    description:
      "1-indexed line number where the caret currently sits. 0 when no caret position is known.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 340,
  },
  {
    name: "current_column_number",
    label: "Current column number",
    description:
      "1-indexed column number where the caret currently sits. 0 when no caret position is known.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 345,
  },
  {
    name: "selection_range",
    label: "Selection range",
    description:
      "Object describing the current selection: `{ startLine, startColumn, endLine, endColumn }`. Empty when nothing is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 350,
  },
  {
    name: "current_function_name",
    label: "Current function / symbol",
    description:
      "Best-effort name of the enclosing function, method, or top-level symbol containing the caret. Empty when not detectable.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 360,
  },

  // ── Workspace state (400-449) ─────────────────────────────────────────
  {
    name: "open_file_paths",
    label: "Open file paths",
    description:
      "Array of file paths currently open in tabs. Empty array when nothing is open. Always populated.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 400,
    sortOrder: 400,
  },
  {
    name: "open_file_count",
    label: "Open file count",
    description:
      "Number of tabs currently open in the editor (derived; equivalent to `open_file_paths.length`). Always populated; zero when nothing is open.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 410,
  },
  {
    name: "modified_file_paths",
    label: "Modified file paths",
    description:
      "Array of file paths with unsaved edits across all open tabs. Empty array when everything is saved.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 420,
  },
  {
    name: "workspace_root",
    label: "Workspace root path",
    description:
      "Absolute path of the workspace root containing the open files. Empty when no workspace is loaded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 430,
  },
];

export const codeEditorManifest: SurfaceManifest = {
  surfaceName: "matrx-user/code-editor",
  values: mergeBaselineValues(
    pickBaseline("selection", "text_before", "text_after", "content", "context"),
    surfaceSpecific,
  ),
};

export function createCodeEditorScope(values: {
  // alwaysAvailable: true → required
  open_file_paths: string[];
  open_file_count: number;
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
  current_line_number?: number;
  current_column_number?: number;
  selection_range?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  current_function_name?: string;
  modified_file_paths?: string[];
  workspace_root?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
