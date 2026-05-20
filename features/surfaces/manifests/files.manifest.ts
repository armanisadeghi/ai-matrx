/**
 * Surface manifest — Cloud files browser (`matrx-user/files`).
 *
 * The cloud files browser (route `/files`). The user navigates folders, selects
 * one or more files, and opens a file for preview.
 *
 * Agents bound here operate on the active file (describe / classify / extract),
 * a multi-file selection (batch tag / organize), or the current folder
 * (summarize contents). File IDs let downstream tools fetch the actual bytes
 * through the file handler.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  // ── Active file (300-339) ─────────────────────────────────────────────
  {
    name: "active_file_id",
    label: "Active file ID",
    description:
      "UUID of the file the user has focused/opened. Empty when no file is active.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "active_file_name",
    label: "Active file name",
    description:
      "Display name of the active file (e.g. \"report.pdf\"). Empty when no file is active.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 310,
  },
  {
    name: "active_file_path",
    label: "Active file path",
    description:
      "Full path of the active file within the cloud files tree. Empty when no file is active.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 320,
  },
  {
    name: "active_file_mime_type",
    label: "Active file MIME type",
    description:
      'MIME type of the active file (e.g. "application/pdf", "image/png"). Empty when unknown or no file is active.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 330,
  },
  {
    name: "active_file_size",
    label: "Active file size (bytes)",
    description:
      "Size of the active file in bytes. Zero when unknown or no file is active.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 335,
  },

  // ── Folder context (340-359) ──────────────────────────────────────────
  {
    name: "active_folder_id",
    label: "Active folder ID",
    description:
      "UUID of the folder the user is currently browsing. Empty when at the root or no folder context.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 340,
  },
  {
    name: "active_folder_path",
    label: "Active folder path",
    description:
      "Path of the folder currently being browsed. Empty when at the root.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 350,
  },

  // ── Selection (360-389) ───────────────────────────────────────────────
  {
    name: "selected_file_ids",
    label: "Selected file IDs",
    description:
      "Array of UUIDs of all currently-selected files. Empty array when nothing is selected.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 360,
    sortOrder: 360,
  },
  {
    name: "selected_file_names",
    label: "Selected file names",
    description:
      "Array of display names matching `selected_file_ids`, in the same order. Empty array when nothing is selected.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 370,
  },
  {
    name: "selected_count",
    label: "Selected count",
    description:
      "Number of files currently selected. Zero when nothing is selected.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 380,
  },
];

export const filesManifest: SurfaceManifest = {
  surfaceName: "matrx-user/files",
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

export function createFilesScope(values: {
  selection?: string;
  context?: Record<string, unknown>;
  active_file_id?: string;
  active_file_name?: string;
  active_file_path?: string;
  active_file_mime_type?: string;
  active_file_size?: number;
  active_folder_id?: string;
  active_folder_path?: string;
  selected_file_ids?: string[];
  selected_file_names?: string[];
  selected_count?: number;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
