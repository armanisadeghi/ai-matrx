/**
 * What the canonical file picker (`FilesResourcePicker`) lists — pure, so the
 * rule is tested without a store.
 *
 * THE RULE: the picker lists from the person's WHOLE library, the same
 * `cloudFiles` tree the Files app reads (`get_user_file_tree`, every page), and
 * never truncates it. Recents is every file the database's Recents rule admits
 * (`isRecentActivityFile`), and a search is the files library's own search
 * (`searchFiles` / `searchFolders` from `features/files/redux/tree-utils`) over
 * that same tree — files AND folders, every match. Render cost is bounded by
 * `useInfiniteWindow` ("Show more"), never by dropping rows: until 2026-09-29
 * both lists stopped silently at 20, so a person with 415 recent files saw 20,
 * and a search with 30 matches showed the 20 newest — the same rows Recents
 * already showed — and read as "search only finds what is already on screen".
 */

import { getFilePreviewProfile } from "@/features/files/utils/file-types";
import { isRecentActivityFile } from "@/features/files/utils/user-visible";
import {
  searchFiles,
  searchFolders,
} from "@/features/files/redux/tree-utils";
import type {
  CloudFileRecord,
  CloudFolderRecord,
} from "@/features/files/types";

/** File-type filter used by the picker UI. */
export type FilesResourcePickerFilter =
  | "all"
  | "pdf-extractor"
  | "pdfs"
  | "text"
  | "markdown"
  | "code"
  | "photos"
  | "videos"
  | "audio"
  | "data"
  | "other";

export type FilesPickerSort = "updated" | "name" | "size";

/** Empty set reused when the "Already read" filter is inactive. */
export const EMPTY_PROCESSED_FILE_IDS: ReadonlySet<string> = new Set<string>();

const KNOWN_PREVIEW_KINDS = [
  "pdf",
  "text",
  "html",
  "markdown",
  "code",
  "image",
  "svg",
  "audio",
  "video",
  "data",
  "spreadsheet",
];

export function matchesFileFilter(
  file: CloudFileRecord,
  filter: FilesResourcePickerFilter,
  processedFileIds: ReadonlySet<string> = EMPTY_PROCESSED_FILE_IDS,
): boolean {
  if (filter === "pdf-extractor") {
    // Membership in `/tools/pdf-extractor` studio docs — never MIME.
    return processedFileIds.has(file.id);
  }
  const { previewKind } = getFilePreviewProfile(
    file.fileName,
    file.mimeType,
    file.fileSize,
  );
  switch (filter) {
    case "pdfs":
      return previewKind === "pdf";
    case "text":
      return previewKind === "text" || previewKind === "html";
    case "markdown":
      return previewKind === "markdown";
    case "code":
      return previewKind === "code";
    case "photos":
      return previewKind === "image" || previewKind === "svg";
    case "audio":
      return previewKind === "audio";
    case "videos":
      return previewKind === "video";
    case "data":
      return previewKind === "data" || previewKind === "spreadsheet";
    case "other":
      return !KNOWN_PREVIEW_KINDS.includes(previewKind);
    default:
      return true;
  }
}

export function sortFiles(
  files: CloudFileRecord[],
  sort: FilesPickerSort,
): CloudFileRecord[] {
  return [...files].sort((a, b) => {
    if (sort === "name") return a.fileName.localeCompare(b.fileName);
    if (sort === "size") return (b.fileSize ?? 0) - (a.fileSize ?? 0);
    return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
  });
}

/** A file the window shows under an organization filter (none = every file). */
export function inOrganization(
  file: CloudFileRecord,
  organizationId: string | null | undefined,
): boolean {
  return !organizationId || file.organizationId === organizationId;
}

export interface FilesPickerListOptions {
  organizationId?: string | null;
  filter: FilesResourcePickerFilter;
  sort: FilesPickerSort;
  processedFileIds?: ReadonlySet<string>;
}

/** Every Recents file in the library, filtered and sorted — never capped. */
export function pickerRecentFiles(
  filesById: Record<string, CloudFileRecord>,
  { organizationId, filter, sort, processedFileIds }: FilesPickerListOptions,
): CloudFileRecord[] {
  return sortFiles(
    Object.values(filesById).filter(
      (f) =>
        !!f &&
        !f.deletedAt &&
        isRecentActivityFile(f) &&
        inOrganization(f, organizationId) &&
        matchesFileFilter(f, filter, processedFileIds),
    ),
    sort,
  );
}

export interface FilesPickerSearchResult {
  files: CloudFileRecord[];
  folders: CloudFolderRecord[];
}

/**
 * The files library's own search over the whole tree — every matching file
 * and folder, never capped. Folders are listed only when no organization
 * filter is set (a folder carries no organization; its files are filtered
 * when it opens).
 */
export function pickerSearch(
  filesById: Record<string, CloudFileRecord>,
  foldersById: Record<string, CloudFolderRecord>,
  query: string,
  { organizationId, filter, sort, processedFileIds }: FilesPickerListOptions,
): FilesPickerSearchResult {
  if (!query.trim()) return { files: [], folders: [] };
  const files = sortFiles(
    searchFiles(filesById, query).filter(
      (f) =>
        inOrganization(f, organizationId) &&
        matchesFileFilter(f, filter, processedFileIds),
    ),
    sort,
  );
  const folders = organizationId
    ? []
    : searchFolders(foldersById, query)
        .filter((f) => f.source?.kind !== "virtual")
        .sort((a, b) => a.folderPath.localeCompare(b.folderPath));
  return { files, folders };
}
