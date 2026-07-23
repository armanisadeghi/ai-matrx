"use client";

/**
 * FilesResourcePicker
 *
 * Browse cloud files and pick one to attach as an AI resource reference.
 * Migrated in Phase 9: the internals now use the cloud-files system
 * (features/files/*) — one canonical file system and one access model with a
 * unified tree per user. The {onBack, onSelect} surface is unchanged so
 * every caller keeps working without edits.
 *
 * The returned selection shape is:
 *   { url, type, details }
 * where `url` is a 1-hour signed URL, `type` is the mime type, and
 * `details` is the EnhancedFileDetails produced by getFileDetailsByUrl(...)
 * (legacy utility — same as before).
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Folder,
  Grid3x3,
  List,
  Loader2,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getFileDetailsByUrl,
  type EnhancedFileDetails,
} from "@/utils/file-operations/constants";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  getFilePreviewProfile,
  useCloudTree,
  useFileMutation,
  useInfiniteWindow,
} from "@/features/files";
import { MediaThumbnail } from "@/features/files/components/core/MediaThumbnail/MediaThumbnail";
import { FileMeta } from "@/features/files/components/core/FileMeta/FileMeta";
import { filesDb, FILES_TABLE_COLUMNS } from "@/features/files/filesDb";
import { dbRowToCloudFile } from "@/features/files/redux/converters";
import { truncateFilename } from "@/features/files/utils/format";
import {
  EMPTY_TREE_CHILDREN,
  selectAllFilesArray,
  selectAllFilesMap,
  selectAllFoldersMap,
  selectChildrenByFolderId,
  selectRootFileIds,
  selectRootFolderIds,
  selectTreeStatus,
  selectIsFolderFullyLoaded,
} from "@/features/files/redux/selectors";
import { loadFolderContents } from "@/features/files/redux/thunks";
import { isExcludedFromRecents } from "@/features/files/utils/folder-conventions";
import type { CloudFileRecord, CloudFolderRecord } from "@/features/files";
import { supabase } from "@/utils/supabase/client";
import {
  cldSourceFileIdsFromStudioDocs,
  usePdfStudioDocs,
} from "@/features/pdf-extractor/studio/hooks/usePdfStudioDocs";
import { usePickerInputFocus } from "./usePickerInputFocus";

/** Same cap as `buildRows` recents filter in the files list. */
/** Two viewports worth of rows; never mount a 100-item thumbnail fan-out. */
const RECENTS_CAP = 20;

type PickerViewMode = "list" | "grid";
/** File-type filter used by Stored Files / Cloud Files picker UI. */
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

type FileFilter = FilesResourcePickerFilter;
type FileSort = "updated" | "name" | "size";

const SEARCH_DEBOUNCE_MS = 350;
const SEARCH_RESULT_LIMIT = 20;
const PICKER_PAGE_SIZE = 12;

/** Empty set reused when the PDF Extractor filter is inactive. */
const EMPTY_PROCESSED_FILE_IDS = new Set<string>();

// ---------------------------------------------------------------------------
// Types (preserve the legacy surface)
// ---------------------------------------------------------------------------

export type FileSelection = {
  /**
   * cld_files UUID. When present, downstream code that needs to send the
   * file to a backend AI API should build a `MediaRef` from this id (via
   * `fileIdToMediaRef`) rather than the share URL.
   */
  fileId: string;
  url: string;
  /**
   * Historical legacy field — has held the real RFC MIME in this picker
   * (`"image/jpeg"`). Kept for back-compat. New consumers should prefer
   * `mime_type` below.
   */
  type: string;
  /** Real RFC MIME type. The canonical field for outbound AI payloads. */
  mime_type: string;
  details: EnhancedFileDetails;
};

interface FilesResourcePickerProps {
  onBack: () => void;
  onSelect: (selection: FileSelection) => void;
  /**
   * Optional: restrict the picker to specific top-level folders (e.g.
   * `["Images", "Documents"]`). Ignored if empty or omitted.
   *
   * The prop is still named `allowedBuckets` to avoid breaking callers —
   * it's just repurposed as a folder-name filter.
   */
  allowedBuckets?: string[];
  /**
   * Initial file-type filter. Defaults to `"all"`. Callers embedding this
   * picker for a media-specific variable (image/audio/video) can open
   * already filtered without changing the Smart Agent Input path.
   */
  initialFilter?: FilesResourcePickerFilter;
  /**
   * Fill the host's height instead of self-capping.
   *
   * Default (`false`) keeps the compact popover sizing the chat "+" menu
   * relies on. Hosts that supply their own definite height — the
   * `FilePickerWindow` window panel — pass `true` so the list uses the full
   * available height and scrolls inside it, instead of capping at 460px and
   * leaving dead space with a clipped final row.
   */
  fillHost?: boolean;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function matchesFileFilter(
  file: CloudFileRecord,
  filter: FileFilter,
  processedFileIds: ReadonlySet<string> = EMPTY_PROCESSED_FILE_IDS,
) {
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
      return ![
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
      ].includes(previewKind);
    default:
      return true;
  }
}

function sortFiles(files: CloudFileRecord[], sort: FileSort) {
  return [...files].sort((a, b) => {
    if (sort === "name") return a.fileName.localeCompare(b.fileName);
    if (sort === "size") return (b.fileSize ?? 0) - (a.fileSize ?? 0);
    return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
  });
}

// ---------------------------------------------------------------------------
// File row (recent list + search results)
// ---------------------------------------------------------------------------

interface FileRowProps {
  file: CloudFileRecord;
  onSelect: (file: CloudFileRecord) => void;
}

function FileRow({ file, onSelect }: FileRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(file)}
      className="flex w-full items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-left"
    >
      <MediaThumbnail
        file={file}
        iconSize={14}
        rounded="rounded-md"
        preferAssetThumbnail={false}
        className="h-10 w-10 shrink-0 border border-border/50"
      />
      <div className="flex-1 min-w-0">
        <div className="text-xs truncate text-gray-900 dark:text-gray-100">
          {file.fileName}
        </div>
        <FileMeta
          file={{
            fileSize: file.fileSize,
            updatedAt: file.updatedAt,
            visibility: file.visibility,
          }}
          hide={{ visibility: true }}
          className="mt-0.5 text-[10px]"
        />
      </div>
    </button>
  );
}

interface FileGridTileProps {
  file: CloudFileRecord;
  onSelect: (file: CloudFileRecord) => void;
}

function FileGridTile({ file, onSelect }: FileGridTileProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(file)}
      title={file.fileName}
      className="group flex flex-col overflow-hidden rounded-md border border-border/60 bg-card hover:border-primary/40 hover:ring-1 hover:ring-primary/30 transition-all text-left"
    >
      <div className="relative aspect-square w-full bg-muted/40">
        <MediaThumbnail
          file={file}
          iconSize={24}
          rounded="rounded-none"
          preferAssetThumbnail={false}
          className="absolute inset-0 h-full w-full"
        />
      </div>
      <div className="px-1.5 py-1 min-w-0">
        <div className="text-[10px] truncate text-gray-900 dark:text-gray-100">
          {truncateFilename(file.fileName, 16)}
        </div>
      </div>
    </button>
  );
}

interface FileListOrGridProps {
  files: CloudFileRecord[];
  viewMode: PickerViewMode;
  onSelect: (file: CloudFileRecord) => void;
  className?: string;
}

function FileListOrGrid({
  files,
  viewMode,
  onSelect,
  className,
}: FileListOrGridProps) {
  const { visibleCount, hasMore, sentinelRef, loadMore } = useInfiniteWindow({
    total: files.length,
    initial: PICKER_PAGE_SIZE,
    pageSize: PICKER_PAGE_SIZE,
    resetKey: files,
  });
  const visibleFiles = files.slice(0, visibleCount);

  if (files.length === 0) return null;

  if (viewMode === "grid") {
    return (
      <div className={className}>
        <div className="grid grid-cols-3 gap-1.5 px-1">
          {visibleFiles.map((file) => (
            <FileGridTile key={file.id} file={file} onSelect={onSelect} />
          ))}
        </div>
        {hasMore ? (
          <button
            ref={sentinelRef}
            type="button"
            onClick={loadMore}
            className="mt-1.5 w-full rounded px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Show more files
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={className}>
      {visibleFiles.map((file) => (
        <FileRow key={file.id} file={file} onSelect={onSelect} />
      ))}
      {hasMore ? (
        <button
          ref={sentinelRef}
          type="button"
          onClick={loadMore}
          className="w-full rounded px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Show more files
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree node
// ---------------------------------------------------------------------------

interface TreeNodeProps {
  folderId: string | null; // null = root
  label: string;
  level: number;
  onFileSelect: (file: CloudFileRecord) => void;
  viewMode: PickerViewMode;
  fileFilter: FileFilter;
  fileSort: FileSort;
  /** Source file ids from `usePdfStudioDocs` — required for `pdf-extractor`. */
  processedFileIds: ReadonlySet<string>;
  defaultOpen?: boolean;
}

function FolderNode({
  folderId,
  label,
  level,
  onFileSelect,
  viewMode,
  fileFilter,
  fileSort,
  processedFileIds,
  defaultOpen = false,
}: TreeNodeProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [isLoadingChildren, setIsLoadingChildren] = useState(false);
  const dispatch = useAppDispatch();
  const foldersById = useAppSelector(selectAllFoldersMap);
  const filesById = useAppSelector(selectAllFilesMap);
  const childrenByFolderId = useAppSelector(selectChildrenByFolderId);
  const rootFolderIds = useAppSelector(selectRootFolderIds);
  const rootFileIds = useAppSelector(selectRootFileIds);
  const fullyLoaded = useAppSelector((state) =>
    folderId ? selectIsFolderFullyLoaded(state, folderId) : true,
  );

  const children = folderId
    ? (childrenByFolderId[folderId] ?? EMPTY_TREE_CHILDREN)
    : { folderIds: rootFolderIds, fileIds: rootFileIds };

  const childFiles = useMemo(
    () =>
      sortFiles(
        children.fileIds
          .map((id) => filesById[id])
          .filter(
            (f): f is CloudFileRecord =>
              !!f &&
              !f.deletedAt &&
              matchesFileFilter(f, fileFilter, processedFileIds),
          ),
        fileSort,
      ),
    [children.fileIds, filesById, fileFilter, fileSort, processedFileIds],
  );

  const paddingLeft = level * 1.25;

  const handleToggle = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (!nextOpen || !folderId || fullyLoaded || isLoadingChildren) return;

    setIsLoadingChildren(true);
    void dispatch(loadFolderContents({ folderId })).finally(() => {
      setIsLoadingChildren(false);
    });
  };

  return (
    <div>
      {folderId !== null ? (
        <button
          onClick={handleToggle}
          className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          style={{ paddingLeft: `${paddingLeft}rem` }}
        >
          <div className="flex items-center min-w-0 w-full">
            <div className="flex items-center flex-shrink-0">
              <div className="w-4 h-4 mr-1">
                {isLoadingChildren ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : open ? (
                  <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
                )}
              </div>
              <Folder className="h-3.5 w-3.5 mr-2 text-blue-600 dark:text-blue-500" />
            </div>
            <span className="text-xs truncate flex-1 text-gray-900 dark:text-gray-100">
              {label}
            </span>
          </div>
        </button>
      ) : null}

      {(open || folderId === null) && (
        <div>
          {isLoadingChildren ? (
            <div
              className="flex items-center gap-1.5 py-1 text-[10px] text-muted-foreground"
              style={{ paddingLeft: `${(level + 1) * 1.25}rem` }}
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading files…
            </div>
          ) : children.folderIds.length === 0 &&
            children.fileIds.length === 0 ? (
            <div
              className="text-[10px] text-gray-500 dark:text-gray-400 py-1"
              style={{ paddingLeft: `${(level + 1) * 1.25}rem` }}
            >
              Empty folder
            </div>
          ) : (
            <>
              {children.folderIds.map((id) => {
                const folder = foldersById[id];
                if (!folder || folder.deletedAt) return null;
                return (
                  <FolderNode
                    key={id}
                    folderId={id}
                    label={folder.folderName}
                    level={folderId === null ? 0 : level + 1}
                    onFileSelect={onFileSelect}
                    viewMode={viewMode}
                    fileFilter={fileFilter}
                    fileSort={fileSort}
                    processedFileIds={processedFileIds}
                  />
                );
              })}
              <div
                style={{
                  paddingLeft: `${
                    folderId === null ? 0 : (level + 1) * 1.25
                  }rem`,
                }}
              >
                <FileListOrGrid
                  files={childFiles}
                  viewMode={viewMode}
                  onSelect={onFileSelect}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FilesResourcePicker({
  onBack,
  onSelect,
  allowedBuckets,
  initialFilter = "all",
  fillHost = false,
}: FilesResourcePickerProps) {
  const currentUserId = useAppSelector(
    (s: unknown) => (s as { user?: { id?: string | null } }).user?.id ?? null,
  );
  useCloudTree(currentUserId ?? null);
  const treeStatus = useAppSelector(selectTreeStatus);
  const foldersById = useAppSelector(selectAllFoldersMap);
  const filesById = useAppSelector(selectAllFilesMap);
  const rootFolderIds = useAppSelector(selectRootFolderIds);
  const allFiles = useAppSelector(selectAllFilesArray);

  const fileMutation = useFileMutation();
  const searchInputRef = usePickerInputFocus();

  // ── Scroll affordance ──────────────────────────────────────────────────
  // Drives the bottom fade. Recomputed on scroll and whenever the content
  // box resizes (filter change, folder expand/collapse, host resize) so it
  // never claims "more below" for a list that already ends on screen.
  const listScrollRef = useRef<HTMLDivElement>(null);
  const listContentRef = useRef<HTMLDivElement>(null);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);
  const syncScrollAffordance = useCallback(() => {
    const el = listScrollRef.current;
    if (!el) return;
    setHasMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  }, []);
  useEffect(() => {
    syncScrollAffordance();
    const content = listContentRef.current;
    const scroller = listScrollRef.current;
    if (!content || !scroller || typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const observer = new ResizeObserver(() => syncScrollAffordance());
    observer.observe(content);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [syncScrollAffordance]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<PickerViewMode>("list");
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileFilter, setFileFilter] = useState<FileFilter>(initialFilter);
  const [fileSort, setFileSort] = useState<FileSort>("updated");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [resolvedProcessedFiles, setResolvedProcessedFiles] = useState<
    CloudFileRecord[]
  >([]);
  const [processedFilesLoading, setProcessedFilesLoading] = useState(false);

  const isPdfExtractorFilter = fileFilter === "pdf-extractor";
  const isSearching = searchQuery.trim().length > 0;

  // Same `processed_documents` corpus as `/tools/pdf-extractor` (roots,
  // non-archived). The "pdf-extractor" filter is membership in this list —
  // never a MIME / extension heuristic. Fetch only while that filter is on.
  const studioDocs = usePdfStudioDocs({ enabled: isPdfExtractorFilter });
  const processedSourceFileIds = useMemo(
    () => cldSourceFileIdsFromStudioDocs(studioDocs.docs),
    [studioDocs.docs],
  );
  const processedFileIds = useMemo(
    () => new Set(processedSourceFileIds),
    [processedSourceFileIds],
  );

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearchQuery(searchQuery.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  // Resolve studio source ids → CloudFileRecords (Redux first, then a
  // batched files.files read for anything the tree hasn't hydrated).
  useEffect(() => {
    if (!isPdfExtractorFilter) {
      // The source corpus is external async state; clear its cached projection
      // when this optional mode is disabled.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResolvedProcessedFiles([]);
      setProcessedFilesLoading(false);
      return undefined;
    }

    let cancelled = false;
    const orderedIds = processedSourceFileIds;
    if (orderedIds.length === 0) {
      setResolvedProcessedFiles([]);
      setProcessedFilesLoading(studioDocs.loading);
      return undefined;
    }

    setProcessedFilesLoading(true);
    void (async () => {
      try {
        const fromStore: CloudFileRecord[] = [];
        const missing: string[] = [];
        for (const id of orderedIds) {
          const hit = filesById[id];
          if (hit && !hit.deletedAt) fromStore.push(hit);
          else missing.push(id);
        }

        let fetchedById = new Map<string, CloudFileRecord>();
        if (missing.length > 0) {
          const { data, error } = await filesDb(supabase)
            .from("files")
            .select(FILES_TABLE_COLUMNS)
            .in("id", missing)
            .is("deleted_at", null);
          if (error) throw error;
          fetchedById = new Map(
            (data ?? []).map((row) => {
              const file = dbRowToCloudFile(row) as CloudFileRecord;
              return [file.id, file] as const;
            }),
          );
        }
        if (cancelled) return;

        const byId = new Map<string, CloudFileRecord>();
        for (const f of fromStore) byId.set(f.id, f);
        for (const [id, f] of fetchedById) byId.set(id, f);

        // Preserve studio order (created_at desc of the processed doc).
        setResolvedProcessedFiles(
          orderedIds
            .map((id) => byId.get(id))
            .filter((f): f is CloudFileRecord => !!f),
        );
      } catch (error: unknown) {
        if (cancelled) return;
        console.error("Failed to resolve PDF Extractor source files:", error);
        setResolvedProcessedFiles([]);
      } finally {
        if (!cancelled) setProcessedFilesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isPdfExtractorFilter,
    processedSourceFileIds,
    filesById,
    studioDocs.loading,
  ]);

  // Recent files — same rules as the files list Recents view.
  const recentFiles = useMemo(() => {
    const pool = allFiles.filter(
      (f) => !f.deletedAt && !isExcludedFromRecents(f.filePath),
    );
    pool.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    return pool.slice(0, RECENTS_CAP);
  }, [allFiles]);

  const visibleRecentFiles = useMemo(
    () =>
      sortFiles(
        recentFiles.filter((file) =>
          matchesFileFilter(file, fileFilter, processedFileIds),
        ),
        fileSort,
      ),
    [recentFiles, fileFilter, fileSort, processedFileIds],
  );

  const visibleProcessedFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const pool = q
      ? resolvedProcessedFiles.filter(
          (f) =>
            f.fileName.toLowerCase().includes(q) ||
            f.filePath.toLowerCase().includes(q),
        )
      : resolvedProcessedFiles;
    return sortFiles(pool, fileSort);
  }, [resolvedProcessedFiles, searchQuery, fileSort]);

  const visibleSearchResults = useMemo(() => {
    const query = debouncedSearchQuery.trim().toLowerCase();
    return sortFiles(
      allFiles
        .filter(
          (file) =>
            !file.deletedAt &&
            (file.fileName.toLowerCase().includes(query) ||
              file.filePath.toLowerCase().includes(query)),
        )
        .filter((file) =>
          matchesFileFilter(file, fileFilter, processedFileIds),
        ),
      fileSort,
    ).slice(0, SEARCH_RESULT_LIMIT);
  }, [allFiles, debouncedSearchQuery, fileFilter, fileSort, processedFileIds]);

  const handleSearchChange = (value: string) => setSearchQuery(value);

  // Root-level "buckets" are the top-level folders of the user's tree.
  const rootFolders = useMemo<CloudFolderRecord[]>(() => {
    const all = rootFolderIds
      .map((id) => foldersById[id])
      .filter((f): f is CloudFolderRecord => !!f && !f.deletedAt);
    if (allowedBuckets && allowedBuckets.length > 0) {
      return all.filter((f) => allowedBuckets.includes(f.folderName));
    }
    return all;
  }, [rootFolderIds, foldersById, allowedBuckets]);

  const handleFileSelect = async (file: CloudFileRecord) => {
    setIsProcessing(true);
    try {
      // Fetch a short-lived signed URL. Unlike legacy storage, every
      // cloud-files URL is signed — we don't need the "public vs private"
      // dance the old picker did.
      const { url: fileUrl } = await fileMutation.signedUrl(file.id, {
        expiresIn: 3600,
      });

      // Reuse the legacy EnhancedFileDetails shape so downstream callers
      // (resource registry, attachment pills, etc.) read the same fields.
      // The helper tolerates a partial metadata object — cast to sidestep
      // the strict StorageMetadata interface (it demands several fields we
      // don't have here, like eTag/lastModified).
      const baseDetails = getFileDetailsByUrl(fileUrl, {
        size: file.fileSize ?? 0,
        mimetype: file.mimeType ?? "application/octet-stream",
      } as unknown as Parameters<typeof getFileDetailsByUrl>[1]);

      const enhancedDetails: EnhancedFileDetails = {
        ...baseDetails,
        // Canonical name from the cld_files row — never the signed-URL tail
        // (getFileDetailsByUrl can produce `pdf&AWSAccessKeyId=…` garbage).
        filename: file.fileName,
        // `bucket` is legacy — we map it to the parent folder path so
        // downstream code that reads it still has a meaningful value.
        bucket: file.parentFolderId
          ? (foldersById[file.parentFolderId]?.folderPath ?? "")
          : "",
        path: file.filePath,
      };

      const realMime =
        baseDetails.mimetype || file.mimeType || "application/octet-stream";
      onSelect({
        fileId: file.id,
        url: fileUrl,
        type: realMime,
        // Canonical real-MIME field. resource-source.readMime() reads
        // this directly so the outbound payload gets `mime_type:
        // "image/jpeg"` rather than `mime_type: "image"`.
        mime_type: realMime,
        details: enhancedDetails,
      });
    } catch (error) {
      console.error("Error getting file URL:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const loading = isPdfExtractorFilter
    ? studioDocs.loading || processedFilesLoading
    : treeStatus === "loading" || treeStatus === "idle";
  const error = isPdfExtractorFilter
    ? !!studioDocs.error
    : treeStatus === "error";

  return (
    <div
      className={cn(
        "flex flex-col",
        // `fillHost` hosts (window panel) give us a definite height — fill it
        // so the list scrolls inside the full window instead of capping short
        // and leaving dead space under a clipped row.
        fillHost ? "h-full min-h-0" : "max-h-[min(460px,70dvh)]",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 flex-shrink-0"
          onClick={onBack}
          disabled={isProcessing}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Folder className="w-4 h-4 flex-shrink-0 text-gray-600 dark:text-gray-400" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1 truncate">
          {isPdfExtractorFilter ? "PDF Extractor" : "Cloud Files"}
        </span>
        <div
          role="radiogroup"
          aria-label="View mode"
          className="inline-flex items-center rounded-md border bg-background p-0.5 shrink-0"
        >
          {(
            [
              { mode: "list" as const, icon: List, label: "List view" },
              { mode: "grid" as const, icon: Grid3x3, label: "Grid view" },
            ] as const
          ).map(({ mode, icon: Icon, label }) => {
            const active = viewMode === mode;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={label}
                title={label}
                disabled={isProcessing}
                onClick={() => setViewMode(mode)}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/60",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Search */}
      <div className="px-2 py-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder={
              isPdfExtractorFilter
                ? "Search processed documents…"
                : "Search files and folders…"
            }
            value={searchQuery}
            onChange={(event) => handleSearchChange(event.target.value)}
            className="h-7 text-xs pl-7 pr-2 bg-background border-gray-300 dark:border-gray-700"
          />
        </div>
      </div>

      <div className="flex h-8 items-center gap-1.5 border-b border-border px-2">
        <SlidersHorizontal
          className="h-3 w-3 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <label className="sr-only" htmlFor="cloud-files-filter">
          File type
        </label>
        <select
          id="cloud-files-filter"
          value={fileFilter}
          onChange={(event) => setFileFilter(event.target.value as FileFilter)}
          className="h-5 min-w-0 flex-1 bg-transparent text-[10px] text-foreground outline-none"
        >
          <option value="all">All file types</option>
          <option value="pdf-extractor">PDF Extractor (processed)</option>
          <option value="pdfs">PDFs</option>
          <option value="text">Text</option>
          <option value="markdown">Markdown</option>
          <option value="code">Code</option>
          <option value="photos">Photos</option>
          <option value="videos">Videos</option>
          <option value="audio">Audio</option>
          <option value="data">Data</option>
          <option value="other">Other</option>
        </select>
        <label className="sr-only" htmlFor="cloud-files-sort">
          Sort files
        </label>
        <select
          id="cloud-files-sort"
          value={fileSort}
          onChange={(event) => setFileSort(event.target.value as FileSort)}
          className="h-5 w-16 shrink-0 bg-transparent pr-3 text-[10px] text-muted-foreground outline-none"
        >
          <option value="updated">Recent</option>
          <option value="name">Name</option>
          <option value="size">Size</option>
        </select>
      </div>

      {/* Content. The scroller lives inside a non-scrolling wrapper so the
          "more below" fade can sit still at the bottom edge instead of
          scrolling away with the list. */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={listScrollRef}
          onScroll={syncScrollAffordance}
          className="h-full overflow-y-auto scrollbar-visible relative"
        >
          <div ref={listContentRef}>
        {loading ? (
          <div className="flex items-center justify-center h-full py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="text-xs text-red-600 dark:text-red-400 text-center py-8 px-3">
            {studioDocs.error ?? "Error loading files"}
          </div>
        ) : isPdfExtractorFilter ? (
          visibleProcessedFiles.length === 0 ? (
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-8 px-3">
              {isSearching
                ? "No processed documents match this search"
                : "No processed documents yet — extract a file in PDF Extractor first"}
            </div>
          ) : (
            <div className="p-1">
              <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-2 py-0.5">
                Processed documents
              </div>
              <FileListOrGrid
                files={visibleProcessedFiles}
                viewMode={viewMode}
                onSelect={handleFileSelect}
              />
            </div>
          )
        ) : isSearching ? (
          searchQuery.trim() !== debouncedSearchQuery ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching all cloud files…
            </div>
          ) : visibleSearchResults.length === 0 ? (
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
              No files match this search
            </div>
          ) : (
            <div className="p-1">
              <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-2 py-0.5">
                Search results
              </div>
              <FileListOrGrid
                files={visibleSearchResults}
                viewMode={viewMode}
                onSelect={handleFileSelect}
              />
            </div>
          )
        ) : visibleRecentFiles.length === 0 && rootFolders.length === 0 ? (
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
            No files yet
          </div>
        ) : (
          <div className="p-1">
            {visibleRecentFiles.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-2 py-0.5">
                  Recent
                </div>
                <FileListOrGrid
                  files={visibleRecentFiles}
                  viewMode={viewMode}
                  onSelect={handleFileSelect}
                />
              </div>
            )}
            {rootFolders.length > 0 && (
              <div className="mt-1">
                <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-2 py-0.5">
                  Folders
                </div>
                {rootFolders.map((folder) => (
                  <FolderNode
                    key={folder.id}
                    folderId={folder.id}
                    label={folder.folderName}
                    level={0}
                    onFileSelect={handleFileSelect}
                    viewMode={viewMode}
                    fileFilter={fileFilter}
                    fileSort={fileSort}
                    processedFileIds={processedFileIds}
                  />
                ))}
              </div>
            )}
          </div>
        )}

          </div>

          {isProcessing && (
            <div className="absolute inset-0 bg-white/80 dark:bg-zinc-900/80 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          )}
        </div>

        {/* "There's more below" affordance. macOS overlay scrollbars are
            invisible at rest, so a clipped final row read as "the list just
            ends" — this fade makes the cut-off unmistakable. */}
        {hasMoreBelow && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background via-background/80 to-transparent"
          />
        )}
      </div>
    </div>
  );
}
