import { PLACEMENT_TYPES } from "@/features/agent-shortcuts/constants";
import {
  createFilesScope,
  type FilesFileSummary,
  type FilesFolderSummary,
  type FilesUploadSummary,
} from "@/features/surfaces/manifests/files.manifest";
import { isSignedUrl } from "@/lib/media/signed-url";
import type {
  CloudFileRecord,
  CloudFolderRecord,
  ColumnFilters,
  DetailsLevel,
  KindFilter,
  SortBy,
  SortDirection,
  UploadState,
  ViewMode,
  VisibleColumns,
} from "@/features/files/types";

/**
 * Placements offered by the Files browser context menu.
 *
 * Files is metadata-heavy (no text editor), so content-block insertion is
 * intentionally omitted — the user reads/selects files; agents act on the
 * active file, the multi-file selection, or the current folder. We expose the
 * AI-action and quick-action placements only.
 */
export const FILES_CONTEXT_MENU_PLACEMENTS = [
  PLACEMENT_TYPES.AI_ACTION,
  PLACEMENT_TYPES.QUICK_ACTION,
] as const;

/**
 * Shared menu props for `matrx-user/files`.
 *
 * `sourceFeature` is trace-attribution only; `surfaceName` is what drives
 * surface-binding resolution. `"files"` is the surface's own attribution
 * literal in the `SourceFeature` union
 * (`features/agents/types/instance.types.ts`).
 */
export const FILES_CONTEXT_MENU_PROPS = {
  sourceFeature: "files" as const,
  surfaceName: "matrx-user/files" as const,
  isEditable: false as const,
  enabledPlacements: [...FILES_CONTEXT_MENU_PLACEMENTS],
};

/**
 * Row lists are capped so a user sitting on a 5,000-file tree-wide search can
 * never blow the agent's context window. Mirrored in the manifest description.
 */
const ROW_CAP = 200;

export interface BuildFilesContextDataArgs {
  /** Which sibling section of the browser is mounted ("all", "trash", …). */
  section: string;
  /** Load state of the files tree ("idle" | "loading" | "loaded" | "error"). */
  treeStatus: string;
  /** The file currently focused/opened in the preview pane, if any. */
  activeFile?: CloudFileRecord | null;
  /** The folder the user is currently browsing, if any (null at root). */
  activeFolder?: CloudFolderRecord | null;
  /**
   * Files currently selected (checkbox multi-select). Folders in the raw
   * selection are filtered out by the caller — only real file records here.
   */
  selectedFiles?: CloudFileRecord[];
  /** Focused row id (file OR folder) — the highlighted row. */
  focusedId?: string | null;
  /** File rows in scope for the current section/folder/search. */
  visibleFiles?: CloudFileRecord[];
  /** Folder rows in scope for the current section/folder/search. */
  visibleFolders?: CloudFolderRecord[];
  /** Live list-query UI state. */
  searchQuery: string;
  chipFilter: string | null;
  kindFilter: KindFilter;
  columnFilters: ColumnFilters;
  sortBy: SortBy;
  sortDir: SortDirection;
  viewMode: ViewMode;
  detailsLevel: DetailsLevel;
  visibleColumns: VisibleColumns;
  /** Every tracked upload — active plus recently finished tray entries. */
  uploads?: UploadState[];
}

/**
 * DURABLE-REF GUARD (features/files/handler/FEATURE.md).
 *
 * A file's public/CDN URL is emitted ONLY when it is genuinely permanent. A
 * signed S3 URL wearing a `publicUrl`/`cdnUrl` field is the exact bug class
 * that made owned media go dark after an hour — so anything `isSignedUrl()`
 * recognizes is dropped and the agent falls back to `active_file_id`.
 * `storage_uri` never reaches the client at all (column grant REVOKEd).
 */
function durablePublicUrl(file: CloudFileRecord): string | undefined {
  const candidate = file.cdnUrl ?? file.publicUrl;
  if (!candidate) return undefined;
  if (isSignedUrl(candidate)) return undefined;
  return candidate;
}

function toFileSummary(file: CloudFileRecord): FilesFileSummary {
  return {
    id: file.id,
    name: file.fileName,
    path: file.filePath,
    mime_type: file.mimeType,
    size: file.fileSize,
    visibility: file.visibility,
    updated_at: file.updatedAt,
  };
}

function toFolderSummary(folder: CloudFolderRecord): FilesFolderSummary {
  return {
    id: folder.id,
    name: folder.folderName,
    path: folder.folderPath,
    visibility: folder.visibility,
  };
}

function toUploadSummary(upload: UploadState): FilesUploadSummary {
  const percent =
    upload.fileSize > 0
      ? Math.round((upload.bytesUploaded / upload.fileSize) * 100)
      : 0;
  return {
    file_name: upload.fileName,
    file_size: upload.fileSize,
    status: upload.status,
    percent,
    // Durable ref only — the upload tray never carries a URL.
    file_id: upload.fileId,
    error: upload.error,
  };
}

/** Folder path → breadcrumb segments. `/reports/2026` → ["reports", "2026"]. */
function toBreadcrumb(path: string | null | undefined): string[] {
  if (!path) return [];
  return path.split("/").filter(Boolean);
}

/**
 * Canonical `contextData` for `matrx-user/files`.
 *
 * PURE: maps live Files-browser state → `createFilesScope(...)`. Demo and
 * production share one shape. The text baselines (`selection`, `content`,
 * `text_*`) have no meaning on this surface — they are left to the platform
 * floor (`withBaselineScope`). We emit `context` as a compact navigation map
 * plus every value the manifest declares.
 *
 * NEVER emits a signed URL or an S3 storage URI — see `durablePublicUrl`.
 */
export function buildFilesContextData(
  args: BuildFilesContextDataArgs,
): Record<string, unknown> {
  const {
    section,
    treeStatus,
    activeFile = null,
    activeFolder = null,
    selectedFiles = [],
    focusedId = null,
    visibleFiles = [],
    visibleFolders = [],
    searchQuery,
    chipFilter,
    kindFilter,
    columnFilters,
    sortBy,
    sortDir,
    viewMode,
    detailsLevel,
    visibleColumns,
    uploads = [],
  } = args;

  const selectedFileIds = selectedFiles.map((f) => f.id);
  const selectedFileNames = selectedFiles.map((f) => f.fileName);
  const selectedCount = selectedFileIds.length;

  const activeFileSummary: FilesFileSummary | undefined = activeFile
    ? {
        ...toFileSummary(activeFile),
        version: activeFile.currentVersion,
        created_at: activeFile.createdAt,
        public_url: durablePublicUrl(activeFile) ?? null,
      }
    : undefined;

  const activeUploads = uploads.filter(
    (u) => u.status === "uploading" || u.status === "pending",
  );
  const uploadLoaded = activeUploads.reduce((n, u) => n + u.bytesUploaded, 0);
  const uploadTotal = activeUploads.reduce((n, u) => n + u.fileSize, 0);

  const listQuerySummary: Record<string, unknown> = {
    section,
    folder_path: activeFolder?.folderPath ?? null,
    search_query: searchQuery || null,
    chip_filter: chipFilter,
    kind_filter: kindFilter,
    column_filters: columnFilters,
    sort_by: sortBy,
    sort_direction: sortDir,
    view_mode: viewMode,
  };

  // Compact, LLM-readable navigation map. Mirrors the named custom values so a
  // bound agent that didn't map a specific slot still sees the active file,
  // folder, and selection at a glance.
  const context: Record<string, unknown> = {
    surface: "cloud-files-browser",
    section,
    active_file: activeFileSummary ?? null,
    active_folder: activeFolder ? toFolderSummary(activeFolder) : null,
    selection: {
      count: selectedCount,
      file_ids: selectedFileIds,
      file_names: selectedFileNames,
    },
    list_query: listQuerySummary,
    visible: {
      file_count: visibleFiles.length,
      folder_count: visibleFolders.length,
    },
  };

  const scope = createFilesScope({
    // ── Browser location ─────────────────────────────────────────────────
    files_section: section,
    tree_status: treeStatus,
    active_folder_id: activeFolder?.id ?? undefined,
    active_folder_name: activeFolder?.folderName ?? undefined,
    active_folder_path: activeFolder?.folderPath ?? undefined,
    active_folder_breadcrumb: activeFolder
      ? toBreadcrumb(activeFolder.folderPath)
      : undefined,
    active_folder_visibility: activeFolder?.visibility ?? undefined,

    // ── Active file (durable refs only) ──────────────────────────────────
    preview_open: activeFile !== null,
    active_file_id: activeFile?.id ?? undefined,
    active_file_name: activeFile?.fileName ?? undefined,
    active_file_path: activeFile?.filePath ?? undefined,
    active_file_mime_type: activeFile?.mimeType ?? undefined,
    active_file_size: activeFile?.fileSize ?? undefined,
    active_file_visibility: activeFile?.visibility ?? undefined,
    active_file_updated_at: activeFile?.updatedAt ?? undefined,
    active_file_created_at: activeFile?.createdAt ?? undefined,
    active_file_version: activeFile?.currentVersion ?? undefined,
    active_file_public_url: activeFile
      ? durablePublicUrl(activeFile)
      : undefined,
    active_file_summary: activeFileSummary,

    // ── Selection ────────────────────────────────────────────────────────
    selected_file_ids: selectedCount ? selectedFileIds : undefined,
    selected_file_names: selectedCount ? selectedFileNames : undefined,
    selected_count: selectedCount || undefined,
    selected_files: selectedCount
      ? selectedFiles.map(toFileSummary)
      : undefined,
    focused_row_id: focusedId ?? undefined,

    // ── List query and view ──────────────────────────────────────────────
    search_query: searchQuery || undefined,
    chip_filter: chipFilter ?? undefined,
    kind_filter: kindFilter,
    column_filters: columnFilters as unknown as Record<string, unknown>,
    sort_by: sortBy,
    sort_direction: sortDir,
    view_mode: viewMode,
    details_level: detailsLevel,
    visible_columns: visibleColumns as unknown as Record<string, unknown>,
    list_query_summary: listQuerySummary,

    // ── Visible rows ─────────────────────────────────────────────────────
    visible_file_count: visibleFiles.length,
    visible_folder_count: visibleFolders.length,
    visible_files: visibleFiles.slice(0, ROW_CAP).map(toFileSummary),
    visible_folders: visibleFolders.slice(0, ROW_CAP).map(toFolderSummary),

    // ── Transfers ────────────────────────────────────────────────────────
    upload_in_progress: activeUploads.length > 0,
    active_upload_count: activeUploads.length,
    upload_progress_percent:
      uploadTotal > 0 ? Math.round((uploadLoaded / uploadTotal) * 100) : 0,
    recent_uploads: uploads.map(toUploadSummary),

    // ── Baseline escape valve (text baselines left to the platform floor) ─
    context,
  });

  return scope as Record<string, unknown>;
}
