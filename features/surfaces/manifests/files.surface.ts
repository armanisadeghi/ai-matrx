/**
 * Names and scope builder of `files`, kept apart from the manifest body so
 * eagerly loaded features can import them without pulling the manifest
 * (descriptions, write targets) into the shell's first-load JS.
 */
import type { SurfaceScopePayload } from "@ai-matrx/chat/surfaces/types";


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
