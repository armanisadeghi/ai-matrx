/**
 * Surface manifest — Code editor (`matrx-user/code-editor`).
 *
 * Phase 1 proof-of-concept #2. Demonstrates a richer surface with multiple
 * potentially-large values (`current_file_content`, `open_file_paths`) that
 * binding UIs should warn about when bound directly.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/tool-registry/surfaces/types";
import {
  mergeBaselineValues,
  pickBaseline,
} from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "current_file_path",
    label: "Active file path",
    description: "Path of the file currently in focus. Empty when no file is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 300,
  },
  {
    name: "current_file_language",
    label: "Active file language",
    description: "Language id (e.g. `typescript`, `python`, `sql`) of the focused file. Empty when unknown or no file open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 310,
  },
  {
    name: "current_file_content",
    label: "Active file content",
    description: "Full text of the file currently in focus. Can be large — binding UIs warn at ~50KB.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    sortOrder: 320,
  },
  {
    name: "current_line_number",
    label: "Current line number",
    description: "1-indexed line number where the caret currently sits. 0 when no caret position is known.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 330,
  },
  {
    name: "open_file_paths",
    label: "Open file paths",
    description: "Array of file paths currently open in tabs. Empty when nothing is open.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 400,
    sortOrder: 400,
  },
  {
    name: "workspace_root",
    label: "Workspace root path",
    description: "Absolute path of the workspace root containing the open files. Empty when no workspace is loaded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 500,
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
  // alwaysAvailable: false → optional
  selection?: string;
  text_before?: string;
  text_after?: string;
  content?: string;
  context?: Record<string, unknown>;
  current_file_path?: string;
  current_file_language?: string;
  current_file_content?: string;
  current_line_number?: number;
  workspace_root?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
