/**
 * Surface manifest — Files (`matrx-user/files`).
 *
 * The cloud files browser (`/files/all/[...path]` and its sibling sections:
 * recents, photos, shared, starred, trash, folders). The user navigates
 * folders, searches/filters/sorts a list of files, selects one or many, and
 * opens one in the preview pane.
 *
 * Emitter: `features/files/agent-context/buildFilesContextData.ts`, called by
 * `features/files/components/surfaces/PageShell.tsx` at trigger time and
 * published through `<SurfaceRuntimeProvider>`.
 *
 * FILE DOCTRINE (features/files/handler/FEATURE.md) — LOAD-BEARING:
 * this surface NEVER declares or emits a raw signed URL (`?X-Amz-…`) or an S3
 * `storage_uri`. Signed URLs expire and `storage_uri` is REVOKEd from the
 * client entirely. Files are identified by DURABLE refs only: `file_id`
 * (preferred, always re-mintable through `fileHandler` / `useFileSrc`) and, for
 * public files, the permanent CDN URL — and that URL is emitted only after
 * `isSignedUrl()` confirms it is not a signed URL in disguise. Any agent or
 * tool needing bytes resolves them from `active_file_id`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "browser_location",
    label: "Browser location",
    sortOrder: 100,
    description:
      "Where in the files tree the user is standing — section, folder, breadcrumb.",
  },
  {
    key: "active_file",
    label: "Active file",
    sortOrder: 200,
    description:
      "The file open in the preview pane. Identified by durable refs only — never a signed URL.",
  },
  {
    key: "file_selection",
    label: "Selection",
    sortOrder: 300,
    description: "The checkbox multi-selection and the focused row.",
  },
  {
    key: "list_query",
    label: "List query and view",
    sortOrder: 400,
    description:
      "Search, filters, sort, and view mode currently shaping the visible list.",
  },
  {
    key: "visible_rows",
    label: "Visible rows",
    sortOrder: 500,
    description: "The rows the user can actually see after query and filters.",
  },
  {
    key: "transfers",
    label: "Transfers",
    sortOrder: 600,
    description: "In-flight and recently-finished uploads.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Browser location (300-339) ────────────────────────────────────────
  {
    name: "files_section",
    label: "Files section",
    description:
      'Which section of the files browser is open: "all", "recents", "photos", "shared", "starred", "trash", "folders", "requests", or "activity". Always present — "all" is the default section.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    group: "browser_location",
    sortOrder: 300,
  },
  {
    name: "active_folder_id",
    label: "Active folder ID",
    description:
      "UUID of the folder the user has drilled into. Empty when the user is at the section root (no folder drilled into).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "browser_location",
    sortOrder: 310,
  },
  {
    name: "active_folder_name",
    label: "Active folder name",
    description:
      "Display name of the folder the user has drilled into. Empty at the section root.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "browser_location",
    sortOrder: 315,
  },
  {
    name: "active_folder_path",
    label: "Active folder path",
    description:
      'Slash-delimited logical path of the active folder (e.g. "/reports/2026"). Empty at the section root.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "browser_location",
    sortOrder: 320,
  },
  {
    name: "active_folder_breadcrumb",
    label: "Folder breadcrumb",
    description:
      "Array of folder-name segments from the tree root down to the active folder, in order. Empty array at the section root.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "browser_location",
    sortOrder: 325,
  },
  {
    name: "active_folder_visibility",
    label: "Active folder visibility",
    description:
      'Access level of the active folder: "personal", "internal", "link", or "public". Empty at the section root.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    group: "browser_location",
    sortOrder: 330,
  },
  {
    name: "tree_status",
    label: "Tree load status",
    description:
      'Load state of the files tree: "idle", "loading", "loaded", or "error". Always present; anything but "loaded" means the listing is incomplete.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 7,
    group: "browser_location",
    sortOrder: 335,
  },

  // ── Active file (340-399) ─────────────────────────────────────────────
  {
    name: "active_file_id",
    label: "Active file ID",
    description:
      "UUID of the file open in the preview pane. THE durable reference — any tool needing this file's bytes resolves it through the file handler from this id. Empty when no file is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "active_file",
    sortOrder: 340,
  },
  {
    name: "active_file_name",
    label: "Active file name",
    description:
      'Display name of the file open in the preview pane (e.g. "report.pdf"). Empty when no file is open.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    group: "active_file",
    sortOrder: 345,
  },
  {
    name: "active_file_path",
    label: "Active file path",
    description:
      "Full logical path of the active file within the files tree. Empty when no file is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "active_file",
    sortOrder: 350,
  },
  {
    name: "active_file_mime_type",
    label: "Active file MIME type",
    description:
      'MIME type of the active file (e.g. "application/pdf", "image/png"). Empty when the type is unknown or no file is open.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "active_file",
    sortOrder: 355,
  },
  {
    name: "active_file_size",
    label: "Active file size (bytes)",
    description:
      "Size of the active file in bytes. Absent when the size is unknown or no file is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 8,
    group: "active_file",
    sortOrder: 360,
  },
  {
    name: "active_file_visibility",
    label: "Active file visibility",
    description:
      'Access level of the active file: "personal" (one person), "internal" (their org), "link", or "public". Empty when no file is open.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    group: "active_file",
    sortOrder: 365,
  },
  {
    name: "active_file_updated_at",
    label: "Active file modified at",
    description:
      "ISO-8601 timestamp of the active file's last modification. Empty when no file is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "active_file",
    sortOrder: 370,
  },
  {
    name: "active_file_created_at",
    label: "Active file created at",
    description:
      "ISO-8601 timestamp of when the active file was created. Empty when no file is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "active_file",
    sortOrder: 375,
  },
  {
    name: "active_file_version",
    label: "Active file version",
    description:
      "Current version number of the active file (1 for a file never re-uploaded). Absent when no file is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "active_file",
    sortOrder: 380,
  },
  {
    name: "active_file_public_url",
    label: "Active file public URL",
    description:
      "Permanent CDN URL of the active file. Emitted ONLY for files whose stored URL is verified durable (never a signed/expiring URL, never an S3 storage URI). Empty for private files and whenever the durability check fails — use `active_file_id` instead.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "active_file",
    sortOrder: 385,
  },
  {
    name: "active_file_summary",
    label: "Active file summary",
    description:
      "Composite object for the active file: `{ id, name, path, mime_type, size, visibility, version, created_at, updated_at, public_url }`. Contains only durable references. Absent when no file is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    group: "active_file",
    sortOrder: 390,
  },
  {
    name: "preview_open",
    label: "Preview pane open",
    description:
      "True when the right-hand preview pane is showing a file. Always present; false whenever no file is active.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "active_file",
    sortOrder: 395,
  },

  // ── Selection (400-439) ───────────────────────────────────────────────
  {
    name: "selected_file_ids",
    label: "Selected file IDs",
    description:
      "Array of UUIDs of every currently checkbox-selected FILE (folders in the raw selection are excluded). Absent when nothing is selected.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "file_selection",
    sortOrder: 400,
  },
  {
    name: "selected_file_names",
    label: "Selected file names",
    description:
      "Array of display names matching `selected_file_ids`, in the same order. Absent when nothing is selected.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "file_selection",
    sortOrder: 405,
  },
  {
    name: "selected_count",
    label: "Selected file count",
    description:
      "Number of files currently selected. Absent when nothing is selected.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "file_selection",
    sortOrder: 410,
  },
  {
    name: "selected_files",
    label: "Selected files",
    description:
      "Composite array of `{ id, name, path, mime_type, size, visibility }` for every selected file — enough for a batch agent to act without a second lookup. Absent when nothing is selected.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 900,
    group: "file_selection",
    sortOrder: 415,
  },
  {
    name: "focused_row_id",
    label: "Focused row ID",
    description:
      "ID of the single row (file OR folder) with keyboard/visual focus — set after create/upload or a row click. Empty when nothing is focused.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "file_selection",
    sortOrder: 420,
  },

  // ── List query and view (440-489) ─────────────────────────────────────
  {
    name: "search_query",
    label: "Search query",
    description:
      "Text in the tree-wide search box. Empty when the user is not searching; when non-empty the visible rows span the WHOLE tree, not just the active folder.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    group: "list_query",
    sortOrder: 440,
  },
  {
    name: "chip_filter",
    label: "Filter chip",
    description:
      'Active sticky filter chip: "recents" or "starred". Empty when no chip is active (the recents section implies "recents").',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    group: "list_query",
    sortOrder: 445,
  },
  {
    name: "kind_filter",
    label: "Kind filter",
    description:
      'Whether the list shows "all", "files", or "folders". Always present — "all" is the default.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 7,
    group: "list_query",
    sortOrder: 450,
  },
  {
    name: "column_filters",
    label: "Column filters",
    description:
      "Object of the per-column header filters (name, type, extension, mime, path, owner, size, modified, access). Always present; unset columns carry their neutral default.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 300,
    group: "list_query",
    sortOrder: 455,
  },
  {
    name: "sort_by",
    label: "Sort column",
    description:
      'Column the list is sorted by: "name", "type", "extension", "mime", "path", "owner", "size", "version", "updated_at", or "created_at". Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    group: "list_query",
    sortOrder: 460,
  },
  {
    name: "sort_direction",
    label: "Sort direction",
    description: '"asc" or "desc". Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 4,
    group: "list_query",
    sortOrder: 465,
  },
  {
    name: "view_mode",
    label: "View mode",
    description:
      'How the rows are rendered: "list", "grid", or "columns". Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6,
    group: "list_query",
    sortOrder: 470,
  },
  {
    name: "details_level",
    label: "Details level",
    description:
      '"compact" or "extended" — whether the table shows the extra detail columns. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    group: "list_query",
    sortOrder: 475,
  },
  {
    name: "visible_columns",
    label: "Visible columns",
    description:
      "Object flagging which optional table columns are mounted. Always present.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 200,
    group: "list_query",
    sortOrder: 480,
  },
  {
    name: "list_query_summary",
    label: "List query summary",
    description:
      "Composite object of everything shaping the visible list: `{ section, folder_path, search_query, chip_filter, kind_filter, column_filters, sort_by, sort_direction, view_mode }`. Always present.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 500,
    group: "list_query",
    sortOrder: 485,
  },

  // ── Visible rows (490-529) ────────────────────────────────────────────
  {
    name: "visible_file_count",
    label: "Visible file count",
    description:
      "Number of file rows in scope for the current section/folder/search. Always present; zero on an empty view.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    group: "visible_rows",
    sortOrder: 490,
  },
  {
    name: "visible_folder_count",
    label: "Visible folder count",
    description:
      "Number of folder rows in scope for the current section/folder/search. Always present; zero on an empty view.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    group: "visible_rows",
    sortOrder: 495,
  },
  {
    name: "visible_files",
    label: "Visible files",
    description:
      "Array of `{ id, name, path, mime_type, size, visibility, updated_at }` for the file rows in scope, capped at 200 entries to protect the context window. Empty array when the view has no files.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 6000,
    autoContext: false,
    group: "visible_rows",
    sortOrder: 500,
  },
  {
    name: "visible_folders",
    label: "Visible folders",
    description:
      "Array of `{ id, name, path, visibility }` for the folder rows in scope, capped at 200 entries. Empty array when the view has no folders.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 2000,
    autoContext: false,
    group: "visible_rows",
    sortOrder: 505,
  },

  // ── Transfers (530-559) ───────────────────────────────────────────────
  {
    name: "upload_in_progress",
    label: "Upload in progress",
    description:
      "True while at least one upload is pending or uploading. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "transfers",
    sortOrder: 530,
  },
  {
    name: "active_upload_count",
    label: "Active upload count",
    description:
      "Number of uploads currently pending or uploading. Always present; zero when idle.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    group: "transfers",
    sortOrder: 535,
  },
  {
    name: "upload_progress_percent",
    label: "Upload progress percent",
    description:
      "Aggregate percent complete (0-100) across all active uploads. Always present; zero when nothing is uploading.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    group: "transfers",
    sortOrder: 540,
  },
  {
    name: "recent_uploads",
    label: "Recent uploads",
    description:
      "Array of `{ file_name, file_size, status, percent, file_id, error }` for every tracked upload — active plus recently finished ones still in the tray. `file_id` is populated on success (durable ref; no URLs are ever included). Empty array when the tray is empty.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 600,
    autoContext: false,
    group: "transfers",
    sortOrder: 545,
  },
];

export const filesManifest: SurfaceManifest = {
  surfaceName: "matrx-user/files",
  readiness: "verified",
  label: "Files",
  urlPattern: "/files/all/[...path]",
  intro: `<surface_intro>
The user is in the Matrx cloud files browser — a Dropbox-style file manager over
their own files. A left sidebar picks a SECTION (all, recents, photos, shared,
starred, trash, folders); the main pane lists folders and files for the current
section and folder, shaped by a search box, filter chips, per-column filters and
a sort; a right-hand preview pane shows one ACTIVE file when opened.

Read the values in three layers:
  1. WHERE the user is — files_section, active_folder_* / active_folder_breadcrumb.
  2. WHAT they are pointed at — active_file_* (one open file) and
     selected_file_ids / selected_files (a checkbox multi-selection). A batch
     action means the selection; a single-file action means the active file.
  3. WHAT they can see — list_query_summary plus visible_files / visible_folders.

FILE REFERENCES ARE DURABLE, NEVER URLS. Identify every file by its UUID
(active_file_id, selected_file_ids). Bytes are fetched through the platform file
handler from that id. This surface never emits a signed/expiring URL or a
storage location; active_file_public_url appears only for files with a verified
permanent CDN URL. If you need file content, ask for it by id.

The user reads and organizes here — there is no text editor on this surface, so
the text baselines are populated only when the user highlighted something in the
preview pane.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

export interface FilesFileSummary {
  id: string;
  name: string;
  path: string;
  mime_type: string | null;
  size: number | null;
  visibility: string;
  version?: number;
  created_at?: string;
  updated_at?: string;
  public_url?: string | null;
}

export interface FilesFolderSummary {
  id: string;
  name: string;
  path: string;
  visibility: string;
}

export interface FilesUploadSummary {
  file_name: string;
  file_size: number;
  status: string;
  percent: number;
  file_id: string | null;
  error: string | null;
}

/**
 * Scope builder for `matrx-user/files`.
 *
 * Required (no `?`) keys mirror every `alwaysAvailable: true` value — the
 * browser writes them on every launch regardless of UI state.
 */
export function createFilesScope(values: {
  selection?: string;
  context?: Record<string, unknown>;

  // Browser location
  files_section: string;
  tree_status: string;
  active_folder_id?: string;
  active_folder_name?: string;
  active_folder_path?: string;
  active_folder_breadcrumb?: string[];
  active_folder_visibility?: string;

  // Active file
  preview_open: boolean;
  active_file_id?: string;
  active_file_name?: string;
  active_file_path?: string;
  active_file_mime_type?: string;
  active_file_size?: number;
  active_file_visibility?: string;
  active_file_updated_at?: string;
  active_file_created_at?: string;
  active_file_version?: number;
  active_file_public_url?: string;
  active_file_summary?: FilesFileSummary;

  // Selection
  selected_file_ids?: string[];
  selected_file_names?: string[];
  selected_count?: number;
  selected_files?: FilesFileSummary[];
  focused_row_id?: string;

  // List query and view
  kind_filter: string;
  column_filters: Record<string, unknown>;
  sort_by: string;
  sort_direction: string;
  view_mode: string;
  details_level: string;
  visible_columns: Record<string, unknown>;
  list_query_summary: Record<string, unknown>;
  search_query?: string;
  chip_filter?: string;

  // Visible rows
  visible_file_count: number;
  visible_folder_count: number;
  visible_files: FilesFileSummary[];
  visible_folders: FilesFolderSummary[];

  // Transfers
  upload_in_progress: boolean;
  active_upload_count: number;
  upload_progress_percent: number;
  recent_uploads: FilesUploadSummary[];
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
