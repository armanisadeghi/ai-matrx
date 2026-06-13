/**
 * features/files/components/surfaces/dropbox/row-data.ts
 *
 * Shared helpers for shaping file/folder records into "row view models" used
 * by the Dropbox file table and grid. Keeps components dumb — this is where
 * filtering and sorting live.
 */

"use client";

import type {
  AccessFilter,
  CloudFileRecord,
  CloudFolderRecord,
  CloudFilePermission,
  ColumnFilters,
  ModifiedFilter,
  OwnerFilter,
  RagFilter,
  RagStatus,
  SizeFilter,
  SortBy,
  SortDirection,
  TypeFilter,
} from "@/features/files/types";
import {
  compareNodes,
  fileToSortable,
  folderToSortable,
} from "@/features/files/redux/tree-utils";
import { getFileTypeDetails } from "@/features/files/utils/file-types";
import { idMatchesQuery } from "@/utils/search-scoring";
import { toEpochMs } from "@/utils/datetime";
import { isExcludedFromRecents } from "@/features/files/utils/folder-conventions";
import type { CloudFilesSection } from "./section";
import type { FilterChipKey } from "./FilterChips";

// Size-bucket thresholds in bytes. Roughly aligned with what users expect
// when they say "small" / "medium" / "large" for documents and images.
const SIZE_BUCKETS = {
  small: 1 * 1024 * 1024, // <=1 MB
  medium: 10 * 1024 * 1024, // <=10 MB
  large: 100 * 1024 * 1024, // <=100 MB
} as const;

function passesSizeFilter(size: number | null, filter: SizeFilter): boolean {
  if (filter === "any" || size === null) return true;
  if (filter === "small") return size <= SIZE_BUCKETS.small;
  if (filter === "medium")
    return size > SIZE_BUCKETS.small && size <= SIZE_BUCKETS.medium;
  if (filter === "large")
    return size > SIZE_BUCKETS.medium && size <= SIZE_BUCKETS.large;
  return size > SIZE_BUCKETS.large; // "huge"
}

function passesModifiedFilter(
  updatedAt: string,
  filter: ModifiedFilter,
): boolean {
  if (filter === "any") return true;
  const updated = toEpochMs(updatedAt);
  if (Number.isNaN(updated)) return true;
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  if (filter === "today") return now - updated <= day;
  if (filter === "week") return now - updated <= 7 * day;
  return now - updated <= 30 * day; // "month"
}

function passesAccessFilter(visibility: string, filter: AccessFilter): boolean {
  if (filter === "any") return true;
  return visibility === filter;
}

function passesTypeFilter(category: string, filter: TypeFilter): boolean {
  if (!filter || filter.length === 0) return true;
  return filter.includes(category);
}

function passesOwnerFilter(ownerId: string, filter: OwnerFilter): boolean {
  if (!filter || filter.length === 0) return true;
  return filter.includes(ownerId);
}

/**
 * Applies the RAG-status filter. When the user selects "Indexed" from the
 * RAG column header but the prefetch hasn't reached this file yet, we
 * treat the row as not matching — better to under-show than to flicker
 * the wrong answer. A user clicking Refresh on the column header
 * resolves the ambiguity.
 *
 * `unknown` (transient backend error / endpoint unavailable) is treated
 * the same as "no answer yet": only matches when the user explicitly
 * selects `unknown` in the filter.
 */
function passesRagFilter(
  fileId: string,
  filter: RagFilter,
  byFileId: Record<string, RagStatus>,
): boolean {
  if (!filter || filter.length === 0) return true;
  const status = byFileId[fileId] ?? "unknown";
  return filter.includes(status);
}

function passesContains(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function fileExtension(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  if (i <= 0 || i === fileName.length - 1) return "";
  return fileName.slice(i + 1).toLowerCase();
}

export type RowItem =
  | { kind: "folder"; folder: CloudFolderRecord }
  | { kind: "file"; file: CloudFileRecord };

export interface BuildRowsArg {
  folders: CloudFolderRecord[];
  files: CloudFileRecord[];
  section: CloudFilesSection;
  searchQuery: string;
  filter: FilterChipKey | null;
  /** "all" = both kinds; "files" / "folders" = single kind. Default "all". */
  kindFilter?: "all" | "files" | "folders";
  /** Per-column filters from the column-header dropdowns. */
  columnFilters?: ColumnFilters;
  permissionsByResourceId: Record<string, CloudFilePermission[]>;
  /**
   * Per-file RAG status map (`fileId → RagStatus`). Required when the
   * `rag` column filter is non-empty; otherwise unused.
   */
  ragStatusByFileId?: Record<string, RagStatus>;
  /**
   * Active column sort. The Recents filter overrides this with its own
   * `updatedAt desc` sort because that's what "recents" means; everything
   * else respects the user's chosen column.
   */
  sortBy?: SortBy;
  sortDir?: SortDirection;
}

export interface BuildRowsResult {
  rows: RowItem[];
  /**
   * Total rows that matched filters before any cap (e.g. the Recents
   * 100-row cap) was applied. Surfaces in the UI as "Showing N of M".
   */
  totalBeforeCap: number;
  /** True when `rows.length < totalBeforeCap`. */
  capped: boolean;
}

export function buildRows({
  folders,
  files,
  section,
  searchQuery,
  filter,
  kindFilter = "all",
  columnFilters,
  permissionsByResourceId,
  ragStatusByFileId,
  sortBy = "name",
  sortDir = "asc",
}: BuildRowsArg): BuildRowsResult {
  const q = searchQuery.trim().toLowerCase();
  const nameFilter = columnFilters?.name?.trim().toLowerCase() ?? "";
  const matchesQuery = (name: string) => !q || name.toLowerCase().includes(q);
  const matchesNameFilter = (name: string) =>
    !nameFilter || name.toLowerCase().includes(nameFilter);

  // Section filters — applied to files only unless noted.
  const filterFiles = (file: CloudFileRecord): boolean => {
    if (file.deletedAt && section !== "trash") return false;
    if (!file.deletedAt && section === "trash") return false;

    // Recents shows what the user worked on — never system/AI-generated output
    // (scraper captures, variants, Image Studio generations, temp staging).
    if (filter === "recents" && isExcludedFromRecents(file.filePath))
      return false;

    if (section === "photos") {
      const mime = (file.mimeType ?? "").toLowerCase();
      if (!mime.startsWith("image/")) return false;
    }
    if (section === "shared") {
      const perms = permissionsByResourceId[file.id];
      const hasGrants = perms && perms.length > 0;
      const isPublic = file.visibility === "public";
      const isShared = file.visibility === "shared";
      if (!(hasGrants || isPublic || isShared)) return false;
    }
    if (!matchesQuery(file.fileName) && !idMatchesQuery(file, q)) return false;
    if (!matchesNameFilter(file.fileName)) return false;
    if (columnFilters) {
      if (!passesModifiedFilter(file.updatedAt, columnFilters.modified))
        return false;
      if (!passesModifiedFilter(file.createdAt, columnFilters.created))
        return false;
      if (!passesSizeFilter(file.fileSize, columnFilters.size)) return false;
      if (!passesAccessFilter(file.visibility, columnFilters.access))
        return false;
      if (columnFilters.type.length > 0) {
        // Resolve once per row — the registry lookup is O(1) but skip when
        // the filter is unset to keep the hot path tight on long lists.
        const details = getFileTypeDetails(file.fileName);
        if (!passesTypeFilter(details.category, columnFilters.type))
          return false;
      }
      if (!passesOwnerFilter(file.ownerId, columnFilters.owner)) return false;
      if (
        columnFilters.extension &&
        !passesContains(fileExtension(file.fileName), columnFilters.extension)
      ) {
        return false;
      }
      if (
        columnFilters.mime &&
        !passesContains(file.mimeType ?? "", columnFilters.mime)
      ) {
        return false;
      }
      if (
        columnFilters.path &&
        !passesContains(file.filePath, columnFilters.path)
      ) {
        return false;
      }
      if (columnFilters.rag.length > 0) {
        if (
          !passesRagFilter(file.id, columnFilters.rag, ragStatusByFileId ?? {})
        )
          return false;
      }
    }
    return true;
  };

  const filterFolders = (folder: CloudFolderRecord): boolean => {
    if (folder.deletedAt && section !== "trash") return false;
    if (!folder.deletedAt && section === "trash") return false;
    if (filter === "recents" && isExcludedFromRecents(folder.folderPath))
      return false;
    if (section === "photos") return false; // photos view never shows folders
    if (section === "shared") {
      const perms = permissionsByResourceId[folder.id];
      const hasGrants = perms && perms.length > 0;
      const isPublic = folder.visibility === "public";
      const isShared = folder.visibility === "shared";
      if (!(hasGrants || isPublic || isShared)) return false;
    }
    if (!matchesQuery(folder.folderName) && !idMatchesQuery(folder, q))
      return false;
    if (!matchesNameFilter(folder.folderName)) return false;
    if (columnFilters) {
      // Folders don't have a `fileSize` to filter on — size filter when set
      // implicitly hides folders. Same for the access filter, which we DO
      // apply to folders since they have a visibility. Folders are
      // implicitly hidden by any FILE-only filter (type / extension /
      // mime) because folders aren't FileCategory members.
      if (columnFilters.size !== "any") return false;
      if (
        columnFilters.type.length > 0 &&
        !columnFilters.type.includes("FOLDER")
      )
        return false;
      if (columnFilters.extension) return false;
      if (columnFilters.mime) return false;
      // RAG status is a file-only concept; any active rag filter implicitly
      // excludes folders.
      if (columnFilters.rag.length > 0) return false;
      if (!passesModifiedFilter(folder.updatedAt, columnFilters.modified))
        return false;
      if (!passesModifiedFilter(folder.createdAt, columnFilters.created))
        return false;
      if (!passesAccessFilter(folder.visibility, columnFilters.access))
        return false;
      if (!passesOwnerFilter(folder.ownerId, columnFilters.owner)) return false;
      if (
        columnFilters.path &&
        !passesContains(folder.folderPath, columnFilters.path)
      ) {
        return false;
      }
    }
    return true;
  };

  // Kind filter — "files" hides folder rows, "folders" hides file rows.
  // Default "all" preserves the existing two-bucket render.
  const folderRows =
    kindFilter === "files"
      ? []
      : folders
          .filter(filterFolders)
          .map<RowItem>((folder) => ({ kind: "folder", folder }));
  const fileRows =
    kindFilter === "folders"
      ? []
      : files
          .filter(filterFiles)
          .map<RowItem>((file) => ({ kind: "file", file }));

  let rows: RowItem[] = [...folderRows, ...fileRows];

  // ─── Sort ─────────────────────────────────────────────────────────────
  //
  // Recents filter forces `updated_at desc` regardless of column header
  // — that's what "recents" means. Every other view honours the user's
  // chosen sort key + direction from Redux.
  //
  // Implementation reuses the same `compareNodes` comparator used by the
  // sidebar tree (`tree-utils.ts`) so the table and tree always agree on
  // ordering. Folders before files, numeric size, getTime-based dates,
  // null tie-breakers — all centralised there.

  const effectiveSortBy: SortBy = filter === "recents" ? "updated_at" : sortBy;
  const effectiveSortDir: SortDirection =
    filter === "recents" ? "desc" : sortDir;
  const sign = effectiveSortDir === "asc" ? 1 : -1;

  const sortableForRow = (r: RowItem) =>
    r.kind === "file" ? fileToSortable(r.file) : folderToSortable(r.folder);

  // Decorate-sort-undecorate: build SortableNode once per row, sort by
  // index, then read back. Avoids paying the .fileName / .folderName
  // branch in every comparator call (O(N log N) saves M comparisons).
  const decorated = rows.map((row, index) => ({
    row,
    index,
    sortable: sortableForRow(row),
  }));
  decorated.sort((a, b) => {
    const cmp = compareNodes(a.sortable, b.sortable, effectiveSortBy);
    return cmp !== 0
      ? sign * cmp
      : // Stable fallback so equal keys keep their original order.
        a.index - b.index;
  });
  rows = decorated.map((d) => d.row);

  // ─── Cap ──────────────────────────────────────────────────────────────
  //
  // Recents caps at 100 to keep the render budget bounded for users with
  // thousands of files. Surface this through `BuildRowsResult` so the
  // calling component can render "Showing 100 of N" instead of silently
  // truncating. Starred is still a placeholder.

  const totalBeforeCap = rows.length;
  let capped = false;
  if (filter === "recents") {
    if (rows.length > 100) {
      rows = rows.slice(0, 100);
      capped = true;
    }
  } else if (filter === "starred") {
    rows = [];
  }

  return { rows, totalBeforeCap, capped };
}

export function memberCountForResource(
  resourceId: string,
  permissionsByResourceId: Record<string, CloudFilePermission[]>,
): number {
  const perms = permissionsByResourceId[resourceId];
  if (!perms || perms.length === 0) return 0;
  const unique = new Set(perms.map((p) => p.granteeId));
  return unique.size;
}

export function isSharedResource(
  resourceId: string,
  visibility: "public" | "private" | "shared",
  permissionsByResourceId: Record<string, CloudFilePermission[]>,
): boolean {
  if (visibility === "shared" || visibility === "public") return true;
  const perms = permissionsByResourceId[resourceId];
  return !!perms && perms.length > 0;
}
