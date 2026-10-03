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

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  Grid3x3,
  List,
  Loader2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";
import { cn } from "@/lib/utils";
import {
  getFileDetailsByUrl,
  type EnhancedFileDetails,
} from "@/utils/file-operations/constants";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useCloudTree } from "@/features/files/hooks/useCloudTree";
import { useFileMutation } from "@/features/files/hooks/useFileMutation";
import { fileUrls } from "@/features/files/handler/utils/python-base";
import { useInfiniteWindow } from "@/features/files/hooks/useInfiniteWindow";
import { useShowSystemFiles } from "@/features/files/hooks/useShowSystemFiles";
import { ShowSystemFilesToggle } from "@/features/files/components/core/ShowSystemFilesToggle";
import {
  isListedFile,
  isListedFolderPath,
} from "@/features/files/utils/user-visible";
import { MediaThumbnail } from "@ai-matrx/media/react";
import { FileMeta } from "@/features/files/components/core/FileMeta/FileMeta";
import { filesDb, FILES_TABLE_COLUMNS } from "@/features/files/filesDb";
import { dbRowToCloudFile } from "@/features/files/redux/converters";
import { truncateFilename } from "@/features/files/utils/format";
import {
  EMPTY_TREE_CHILDREN,
  selectAllFilesMap,
  selectAllFoldersMap,
  selectChildrenByFolderId,
  selectRootFileIds,
  selectRootFolderIds,
  selectTreeStatus,
  selectIsFolderFullyLoaded,
} from "@/features/files/redux/selectors";
import { loadFolderContents } from "@/features/files/redux/thunks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  inOrganization,
  matchesFileFilter,
  pickerRecentFiles,
  pickerSearch,
  sortFiles,
  type FilesPickerSort,
  type FilesResourcePickerFilter,
} from "./filesPickerLists";
import type {
  CloudFileRecord,
  CloudFolderRecord,
} from "@/features/files/types";
import { supabase } from "@/utils/supabase/client";
import {
  cldSourceFileIdsFromStudioDocs,
  usePdfStudioDocs,
} from "@/features/pdf-extractor/studio/hooks/usePdfStudioDocs";
import { usePickerInputFocus } from "./usePickerInputFocus";
import {
  PickerEmpty,
  PickerRow,
  PickerSearchField,
  PickerSectionLabel,
  PickerView,
  PickerSelect,
  ResourcePickerSubViewHeader,
} from "./ResourcePickerSubViewHeader";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

type PickerViewMode = "list" | "grid";
export type { FilesResourcePickerFilter } from "./filesPickerLists";

type FileFilter = FilesResourcePickerFilter;
type FileSort = FilesPickerSort;

const SEARCH_DEBOUNCE_MS = 350;
const PICKER_PAGE_SIZE = 12;

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
  onSelect: (
    selection: FileSelection,
  ) => boolean | void | Promise<boolean | void>;
  /**
   * Undo a file selected during this picker session. Chat supplies the
   * inverse of its canonical attachment write so unchecking is a real detach,
   * not a cosmetic local-state change.
   */
  onDeselect?: (
    selection: FileSelection,
  ) => boolean | void | Promise<boolean | void>;
  /**
   * Multiple mode attaches on check and detaches on uncheck. Single mode
   * preserves the scalar-picker contract used by media fields and imperative
   * `openFilePicker` callers.
   */
  selectionMode?: "single" | "multiple";
  /**
   * Controlled checked state for `selectionMode="multiple"` — the ids that are
   * ALREADY picked outside this picker (e.g. files attached to a container).
   * The list shows them checked on open and follows the host's truth after
   * every toggle, so a refused write never stays looking checked.
   */
  selectedFileIds?: ReadonlySet<string>;
  /**
   * Optional: restrict the picker to specific top-level folders (e.g.
   * `["Images", "Documents"]`). Ignored if empty or omitted.
   *
   * The prop is still named `allowedBuckets` to avoid breaking callers —
   * it's just repurposed as a folder-name filter.
   */
  allowedBuckets?: string[];
  /**
   * Only files in this organization are listed (recents, search and the folder tree) — a FILTER on
   * what the window shows, never a permission. The data grid's attachment cell passes the table's
   * organization (merged-grid review 2, fix lane F item 4). Absent: every file the person holds.
   */
  organizationId?: string | null;
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
  /**
   * The view's accessible name (default "Files"). Not rendered as a header
   * row: Back sits beside the search box and there is no title row.
   */
  title?: string;
  /**
   * Optional slot rendered at the top of the scroll area, above the lists.
   * The unified "Files" attach view mounts its `InlineUploadArea` here so
   * upload and stored-file browsing share one surface and one scroll.
   */
  topSlot?: ReactNode;
}

// ---------------------------------------------------------------------------
// File row (recent list + search results)
// ---------------------------------------------------------------------------

interface FileRowProps {
  file: CloudFileRecord;
  onSelect: (file: CloudFileRecord) => void;
  multiple: boolean;
  selected: boolean;
}

function FileRow({ file, onSelect, multiple, selected }: FileRowProps) {
  return (
    <div
      className={cn(
        "group flex min-w-0 items-center gap-1 rounded-lg pr-1",
        selected && "bg-primary/5",
      )}
    >
      {multiple ? (
        <label className="flex h-11 w-8 shrink-0 cursor-pointer items-center justify-center pointer-coarse:w-11">
          <Checkbox
            checked={selected}
            onCheckedChange={() => onSelect(file)}
            aria-label={`${selected ? "Remove" : "Select"} ${file.fileName}`}
            className="h-4 w-4"
          />
        </label>
      ) : null}
      <div className="min-w-0 flex-1">
        <PickerRow
          leading={
            <MediaThumbnail
              mediaRef={{
                file_id: file.id,
                mime_type: file.mimeType ?? undefined,
              }}
              fileName={file.fileName}
              mimeType={file.mimeType}
              iconSize={16}
              rounded="rounded-md"
              className="h-9 w-9 shrink-0 border border-border/50"
            />
          }
          label={file.fileName}
          secondary={
            <FileMeta
              file={{
                fileSize: file.fileSize,
                updatedAt: file.updatedAt,
                visibility: file.visibility,
              }}
              hide={{ visibility: true }}
              className="text-xs"
            />
          }
          title={file.fileName}
          onClick={() => onSelect(file)}
        />
      </div>
      <EntityDoorControls
        token="file"
        id={file.id}
        name={file.fileName}
        size="md"
        revealOnHover
        className="shrink-0"
      />
    </div>
  );
}

interface FileGridTileProps {
  file: CloudFileRecord;
  onSelect: (file: CloudFileRecord) => void;
  multiple: boolean;
  selected: boolean;
}

function FileGridTile({
  file,
  onSelect,
  multiple,
  selected,
}: FileGridTileProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-card transition-all hover:border-primary/40 hover:ring-1 hover:ring-primary/30",
        selected ? "border-primary ring-1 ring-primary/30" : "border-border/60",
      )}
    >
      {multiple ? (
        <Checkbox
          checked={selected}
          onCheckedChange={() => onSelect(file)}
          aria-label={`${selected ? "Remove" : "Select"} ${file.fileName}`}
          className="absolute left-1.5 top-1.5 z-10 h-4 w-4 bg-background/90"
        />
      ) : null}
      <div className="absolute right-1 top-1 z-10 rounded-md bg-background/85">
        <EntityDoorControls token="file" id={file.id} name={file.fileName} />
      </div>
      <button
        type="button"
        onClick={() => onSelect(file)}
        title={file.fileName}
        className="flex w-full flex-col text-left"
      >
        <div className="relative aspect-square w-full bg-muted/40">
          <MediaThumbnail
            mediaRef={{
              file_id: file.id,
              mime_type: file.mimeType ?? undefined,
            }}
            fileName={file.fileName}
            mimeType={file.mimeType}
            iconSize={24}
            rounded="rounded-none"
            className="absolute inset-0 h-full w-full"
          />
        </div>
        <div className="min-w-0 px-2 py-1.5">
          <div className="truncate text-xs text-foreground">
            {truncateFilename(file.fileName, 18)}
          </div>
        </div>
      </button>
    </div>
  );
}

interface FileListOrGridProps {
  files: CloudFileRecord[];
  viewMode: PickerViewMode;
  onSelect: (file: CloudFileRecord) => void;
  multiple: boolean;
  selectedFileIds: ReadonlySet<string>;
  className?: string;
  /**
   * `false` = more rows only on an explicit "Show more" click. Recents uses it
   * so scrolling through it never auto-grows the list past the Folders below.
   */
  autoLoad?: boolean;
}

function FileListOrGrid({
  files,
  viewMode,
  onSelect,
  multiple,
  selectedFileIds,
  className,
  autoLoad = true,
}: FileListOrGridProps) {
  const { visibleCount, hasMore, sentinelRef, loadMore } = useInfiniteWindow({
    total: files.length,
    initial: PICKER_PAGE_SIZE,
    pageSize: PICKER_PAGE_SIZE,
    resetKey: files,
  });
  const visibleFiles = files.slice(0, visibleCount);
  const moreRef = autoLoad ? sentinelRef : undefined;
  const moreLabel = `Show ${files.length - visibleCount} more`;

  if (files.length === 0) return null;

  const more = hasMore ? (
    <button
      ref={moreRef}
      type="button"
      onClick={loadMore}
      className="mt-1 flex h-9 w-full items-center justify-center rounded-lg text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:h-11"
    >
      {moreLabel}
    </button>
  ) : null;

  if (viewMode === "grid") {
    return (
      <div className={className}>
        <div className="grid grid-cols-3 gap-1.5 px-0.5">
          {visibleFiles.map((file) => (
            <FileGridTile
              key={file.id}
              file={file}
              onSelect={onSelect}
              multiple={multiple}
              selected={selectedFileIds.has(file.id)}
            />
          ))}
        </div>
        {more}
      </div>
    );
  }

  return (
    <div className={className}>
      {visibleFiles.map((file) => (
        <FileRow
          key={file.id}
          file={file}
          onSelect={onSelect}
          multiple={multiple}
          selected={selectedFileIds.has(file.id)}
        />
      ))}
      {more}
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
  multiple: boolean;
  selectedFileIds: ReadonlySet<string>;
  defaultOpen?: boolean;
  /** Only this organization's files (see `FilesResourcePickerProps.organizationId`). */
  organizationId?: string | null;
  /** The effective `files.show_system_files` knob (the one list rule). */
  showSystemFiles: boolean;
}

/** Indent per tree level, in rem. */
const TREE_INDENT_REM = 1;

function FolderNode({
  folderId,
  label,
  level,
  onFileSelect,
  viewMode,
  fileFilter,
  fileSort,
  processedFileIds,
  multiple,
  selectedFileIds,
  defaultOpen = false,
  organizationId = null,
  showSystemFiles,
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

  const childFiles = sortFiles(
    children.fileIds // org-filter: server-call showSystemFiles is the resolved files.show_system_files setting, not a match on the file's organization
      .map((id) => filesById[id])
      .filter(
        (f): f is CloudFileRecord =>
          !!f &&
          !f.deletedAt &&
          isListedFile(f, showSystemFiles) &&
          inOrganization(f, organizationId) &&
          matchesFileFilter(f, fileFilter, processedFileIds),
      ),
    fileSort,
  );

  const childIndent = `${folderId === null ? 0 : (level + 1) * TREE_INDENT_REM}rem`;

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
        <div style={{ paddingLeft: `${level * TREE_INDENT_REM}rem` }}>
          <PickerRow
            leading={
              <span className="flex shrink-0 items-center gap-1">
                {isLoadingChildren ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : open ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
                  <Folder className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </span>
              </span>
            }
            label={label}
            onClick={handleToggle}
          />
        </div>
      ) : null}

      {(open || folderId === null) && (
        <div>
          {isLoadingChildren ? null : children.folderIds.length === 0 &&
            children.fileIds.length === 0 ? (
            <div
              className="py-1.5 pl-2 text-xs text-muted-foreground"
              style={{ marginLeft: childIndent }}
            >
              Empty folder
            </div>
          ) : (
            <>
              {children.folderIds.map((id) => {
                const folder = foldersById[id];
                if (!folder || folder.deletedAt) return null;
                if (!isListedFolderPath(folder.folderPath, showSystemFiles))
                  return null;
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
                    multiple={multiple}
                    selectedFileIds={selectedFileIds}
                    organizationId={organizationId}
                    showSystemFiles={showSystemFiles}
                  />
                );
              })}
              <div style={{ paddingLeft: childIndent }}>
                <FileListOrGrid
                  files={childFiles}
                  viewMode={viewMode}
                  onSelect={onFileSelect}
                  multiple={multiple}
                  selectedFileIds={selectedFileIds}
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
// PDF Extractor source resolution
// ---------------------------------------------------------------------------

/**
 * Resolve studio source ids → CloudFileRecords (Redux first, then a batched
 * files.files read for anything the tree hasn't hydrated), in studio order.
 */
async function resolveProcessedFiles(
  orderedIds: readonly string[],
  filesById: Record<string, CloudFileRecord | undefined>,
): Promise<CloudFileRecord[]> {
  const byId = new Map<string, CloudFileRecord>();
  const missing: string[] = [];
  for (const id of orderedIds) {
    const hit = filesById[id];
    if (hit && !hit.deletedAt) byId.set(id, hit);
    else missing.push(id);
  }

  if (missing.length > 0) {
    const { data, error } = await filesDb(supabase)
      .from("files")
      .select(FILES_TABLE_COLUMNS)
      .in("id", missing)
      .is("deleted_at", null);
    if (error) throw error;
    for (const row of data ?? []) {
      const file = dbRowToCloudFile(row) as CloudFileRecord;
      byId.set(file.id, file);
    }
  }

  // Preserve studio order (created_at desc of the processed doc).
  return orderedIds
    .map((id) => byId.get(id))
    .filter((f): f is CloudFileRecord => !!f);
}

/**
 * Hand one file to the host in the picker's selection shape. Outside the
 * component so the React Compiler can compile the picker (a try/catch with
 * value blocks makes it skip the whole component).
 */
async function notifyFileSelection(
  file: CloudFileRecord,
  callback: FilesResourcePickerProps["onSelect"] | undefined,
  foldersById: Record<string, CloudFolderRecord | undefined>,
): Promise<boolean | void> {
  if (!callback) return false;
  try {
    // Durable renderable URL — bind the record's own `url` when present,
    // else build it from the file id. Never expires.
    const fileUrl = file.url ?? fileUrls(file.id).inline;

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
    return await callback({
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
    console.error("Error preparing file selection:", error);
    return false;
  }
}

const FILE_FILTER_OPTIONS: ReadonlyArray<{ value: FileFilter; label: string }> =
  [
    { value: "all", label: "All types" },
    { value: "pdf-extractor", label: "Already read" },
    { value: "pdfs", label: "PDFs" },
    { value: "text", label: "Text" },
    { value: "markdown", label: "Markdown" },
    { value: "code", label: "Code" },
    { value: "photos", label: "Photos" },
    { value: "videos", label: "Videos" },
    { value: "audio", label: "Audio" },
    { value: "data", label: "Data" },
    { value: "other", label: "Other" },
  ];

const FILE_SORT_OPTIONS: readonly { value: FileSort; label: string }[] = [
  { value: "updated", label: "Recent" },
  { value: "name", label: "Name" },
  { value: "size", label: "Size" },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FilesResourcePicker({
  onBack,
  onSelect,
  onDeselect,
  selectionMode = "single",
  selectedFileIds: controlledSelectedFileIds,
  allowedBuckets,
  initialFilter = "all",
  fillHost = false,
  organizationId = null,
  title = "Files",
  topSlot,
}: FilesResourcePickerProps) {
  // The picker hydrates the library itself when no one else has (the global
  // CloudFilesRealtimeProvider normally already has). Until 2026-09-29 this
  // read `state.user.id`, a slice that no longer exists, so it never fired.
  const currentUserId = useAppSelector(selectUserId);
  useCloudTree(currentUserId ?? null);
  const treeStatus = useAppSelector(selectTreeStatus);
  const foldersById = useAppSelector(selectAllFoldersMap);
  const filesById = useAppSelector(selectAllFilesMap);
  const rootFolderIds = useAppSelector(selectRootFolderIds);

  const searchInputRef = usePickerInputFocus();

  // ── Scroll affordance ──────────────────────────────────────────────────
  // Drives the bottom fade. Recomputed on scroll and whenever the content
  // box resizes (filter change, folder expand/collapse, host resize) so it
  // never claims "more below" for a list that already ends on screen.
  // macOS overlay scrollbars are invisible at rest, so a clipped final row
  // read as "the list just ends" without it.
  const listScrollRef = useRef<HTMLDivElement>(null);
  const listContentRef = useRef<HTMLDivElement>(null);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);
  const syncScrollAffordance = () => {
    const el = listScrollRef.current;
    if (!el) return;
    setHasMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  };
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
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(
    new Set(),
  );
  const selectedFileIdsRef = useRef<Set<string>>(new Set());
  const pendingFileIdsRef = useRef<Set<string>>(new Set());
  // Controlled selection: mirror the host's ids, keeping any in-flight toggle
  // at its optimistic value until it settles.
  const controlledRef = useRef(controlledSelectedFileIds);
  useEffect(() => {
    controlledRef.current = controlledSelectedFileIds;
  }, [controlledSelectedFileIds]);
  const controlledKey = controlledSelectedFileIds
    ? [...controlledSelectedFileIds].sort().join(",")
    : null;
  const syncFromControlled = () => {
    const truth = controlledRef.current;
    if (!truth) return;
    const next = new Set(truth);
    for (const id of pendingFileIdsRef.current) {
      if (selectedFileIdsRef.current.has(id)) next.add(id);
      else next.delete(id);
    }
    selectedFileIdsRef.current = next;
    setSelectedFileIds(next);
  };
  useEffect(() => {
    if (controlledKey === null) return;
    syncFromControlled();
  }, [controlledKey, syncFromControlled]);
  const [fileFilter, setFileFilter] = useState<FileFilter>(initialFilter);
  const [fileSort, setFileSort] = useState<FileSort>("updated");
  const { showSystemFiles } = useShowSystemFiles();
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  // The resolved "Already read" files, keyed by the source ids they were
  // resolved for — loading is derived from the key, never set in the effect.
  const [resolvedProcessed, setResolvedProcessed] = useState<{
    key: string;
    files: CloudFileRecord[];
  } | null>(null);

  const isPdfExtractorFilter = fileFilter === "pdf-extractor";
  const isSearching = searchQuery.trim().length > 0;
  const searchPending =
    isSearching && searchQuery.trim() !== debouncedSearchQuery;

  // Same `processed_documents` corpus as `/tools/pdf-extractor` (roots,
  // non-archived). The "pdf-extractor" filter is membership in this list —
  // never a MIME / extension heuristic. Fetch only while that filter is on.
  const studioDocs = usePdfStudioDocs({ enabled: isPdfExtractorFilter });
  const processedSourceFileIds = cldSourceFileIdsFromStudioDocs(
    studioDocs.docs,
  );
  const processedFileIds = new Set(processedSourceFileIds);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearchQuery(searchQuery.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  // The source corpus is external async state, resolved only while the
  // "Already read" filter is on; off, the projection reads as empty.
  const processedKey = isPdfExtractorFilter
    ? processedSourceFileIds.join(",")
    : "";
  useEffect(() => {
    if (!processedKey) return undefined;
    let cancelled = false;
    resolveProcessedFiles(processedSourceFileIds, filesById)
      .catch((error: unknown) => {
        console.error("Failed to resolve PDF Extractor source files:", error);
        return [];
      })
      .then((files) => {
        if (!cancelled) setResolvedProcessed({ key: processedKey, files });
      });
    return () => {
      cancelled = true;
    };
  }, [processedKey, processedSourceFileIds, filesById]);
  const processedFilesLoading =
    processedKey !== "" && resolvedProcessed?.key !== processedKey;
  const processedFiles =
    processedKey !== "" ? (resolvedProcessed?.files ?? []) : [];

  // Recents and search: the WHOLE library, never capped (filesPickerLists.ts).
  const visibleRecentFiles = pickerRecentFiles(filesById, {
    organizationId,
    filter: fileFilter,
    sort: fileSort,
    processedFileIds,
  });

  const processedQuery = searchQuery.trim().toLowerCase();
  const visibleProcessedFiles = sortFiles(
    processedQuery
      ? processedFiles.filter(
          (f) =>
            f.fileName.toLowerCase().includes(processedQuery) ||
            f.filePath.toLowerCase().includes(processedQuery),
        )
      : processedFiles,
    fileSort,
  );

  const searchResults = pickerSearch(
    filesById,
    foldersById,
    debouncedSearchQuery,
    {
      organizationId,
      filter: fileFilter,
      sort: fileSort,
      processedFileIds,
      showSystemFiles,
    },
  );
  const visibleSearchResults = searchResults.files;
  const folderSearchResults = searchResults.folders;

  // Root-level "buckets" are the top-level folders of the user's tree.
  const listedRootFolders = rootFolderIds
    .map((id) => foldersById[id])
    .filter(
      (f): f is CloudFolderRecord =>
        !!f &&
        !f.deletedAt &&
        isListedFolderPath(f.folderPath, showSystemFiles),
    );
  const rootFolders =
    allowedBuckets && allowedBuckets.length > 0
      ? listedRootFolders.filter((f) => allowedBuckets.includes(f.folderName))
      : listedRootFolders;

  const submitFile = (file: CloudFileRecord) =>
    notifyFileSelection(file, onSelect, foldersById);

  const deselectFile = (file: CloudFileRecord) =>
    notifyFileSelection(file, onDeselect, foldersById);

  const replaceSelectedFileIds = (next: Set<string>) => {
    selectedFileIdsRef.current = next;
    setSelectedFileIds(next);
  };

  const handleFileSelect = (file: CloudFileRecord) => {
    if (selectionMode === "multiple") {
      if (pendingFileIdsRef.current.has(file.id)) return;

      const wasSelected = selectedFileIdsRef.current.has(file.id);
      const optimistic = new Set(selectedFileIdsRef.current);
      if (wasSelected) optimistic.delete(file.id);
      else optimistic.add(file.id);
      replaceSelectedFileIds(optimistic);

      pendingFileIdsRef.current = new Set(pendingFileIdsRef.current).add(
        file.id,
      );
      void (wasSelected ? deselectFile(file) : submitFile(file))
        .then((accepted) => {
          if (accepted !== false) return;
          const rollback = new Set(selectedFileIdsRef.current);
          if (wasSelected) rollback.add(file.id);
          else rollback.delete(file.id);
          replaceSelectedFileIds(rollback);
        })
        .finally(() => {
          const pending = new Set(pendingFileIdsRef.current);
          pending.delete(file.id);
          pendingFileIdsRef.current = pending;
          // A controlled host reports writes by changing its ids; when a
          // write is refused nothing changes, so fall back to its truth once
          // the host has had time to answer.
          if (controlledRef.current) {
            window.setTimeout(syncFromControlled, 1500);
          }
        });
      return;
    }

    setIsProcessing(true);
    void submitFile(file).finally(() => setIsProcessing(false));
  };

  const loading = isPdfExtractorFilter
    ? studioDocs.loading || processedFilesLoading
    : treeStatus === "loading" || treeStatus === "idle";
  const error = isPdfExtractorFilter
    ? !!studioDocs.error
    : treeStatus === "error";
  const multiple = selectionMode === "multiple";

  const spinner = (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );

  const renderFolderNodes = (folders: CloudFolderRecord[]) =>
    folders.map((folder) => (
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
        multiple={multiple}
        selectedFileIds={selectedFileIds}
        organizationId={organizationId}
        showSystemFiles={showSystemFiles}
      />
    ));

  const renderLists = () => {
    if (loading) return spinner;
    if (error) {
      return (
        <div className="flex items-center justify-center gap-1 px-3 py-10 text-center text-sm text-destructive">
          {studioDocs.error ?? "Could not load your files"}
          <ErrorAlchemyMenu error={studioDocs.error} />
        </div>
      );
    }
    if (isPdfExtractorFilter) {
      if (visibleProcessedFiles.length === 0) {
        return (
          <PickerEmpty>
            {isSearching
              ? "No read documents match"
              : "No documents read yet — read one in PDF Extractor first"}
          </PickerEmpty>
        );
      }
      return (
        <div>
          <PickerSectionLabel>Already read</PickerSectionLabel>
          <FileListOrGrid
            files={visibleProcessedFiles}
            viewMode={viewMode}
            onSelect={handleFileSelect}
            multiple={multiple}
            selectedFileIds={selectedFileIds}
          />
        </div>
      );
    }
    if (isSearching) {
      if (searchPending) return spinner;
      if (
        visibleSearchResults.length === 0 &&
        folderSearchResults.length === 0
      ) {
        return <PickerEmpty>No files or folders match</PickerEmpty>;
      }
      return (
        <div className="space-y-1">
          {visibleSearchResults.length > 0 && (
            <div>
              <PickerSectionLabel>
                Files · {visibleSearchResults.length}
              </PickerSectionLabel>
              <FileListOrGrid
                files={visibleSearchResults}
                viewMode={viewMode}
                onSelect={handleFileSelect}
                multiple={multiple}
                selectedFileIds={selectedFileIds}
              />
            </div>
          )}
          {folderSearchResults.length > 0 && (
            <div>
              <PickerSectionLabel>
                Folders · {folderSearchResults.length}
              </PickerSectionLabel>
              {renderFolderNodes(folderSearchResults)}
            </div>
          )}
        </div>
      );
    }
    if (visibleRecentFiles.length === 0 && rootFolders.length === 0) {
      return <PickerEmpty>No files yet</PickerEmpty>;
    }
    return (
      <div className="space-y-1">
        {visibleRecentFiles.length > 0 && (
          <div>
            <PickerSectionLabel>
              Recent · {visibleRecentFiles.length}
            </PickerSectionLabel>
            <FileListOrGrid
              autoLoad={false}
              files={visibleRecentFiles}
              viewMode={viewMode}
              onSelect={handleFileSelect}
              multiple={multiple}
              selectedFileIds={selectedFileIds}
            />
          </div>
        )}
        {rootFolders.length > 0 && (
          <div>
            <PickerSectionLabel>Folders</PickerSectionLabel>
            {renderFolderNodes(rootFolders)}
          </div>
        )}
      </div>
    );
  };

  return (
    <PickerView
      // `fillHost` hosts (window panel) give us a definite height — fill it
      // so the list scrolls inside the full window instead of capping short.
      className={fillHost ? "max-h-none" : undefined}
    >
      <ResourcePickerSubViewHeader
        onBack={onBack}
        disabled={isProcessing}
        search={
          <PickerSearchField
            ref={searchInputRef}
            placeholder={
              isPdfExtractorFilter
                ? "Search read documents"
                : "Search files and folders"
            }
            value={searchQuery}
            loading={searchPending}
            onChange={setSearchQuery}
          />
        }
      />

      <div className="flex shrink-0 items-center gap-1.5 border-b border-border p-1.5">
        <PickerSelect
          label="File type"
          value={fileFilter}
          onChange={setFileFilter}
          options={FILE_FILTER_OPTIONS}
          className="flex-1"
        />
        <PickerSelect
          label="Sort files"
          value={fileSort}
          onChange={setFileSort}
          options={FILE_SORT_OPTIONS}
          className="w-28 shrink-0"
        />
        <ShowSystemFilesToggle className="h-9 w-9 rounded-lg pointer-coarse:h-11 pointer-coarse:w-11 [&>svg]:h-4 [&>svg]:w-4" />
        <div
          role="radiogroup"
          aria-label="View mode"
          className="inline-flex shrink-0 items-center rounded-lg border border-border bg-background p-0.5"
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
                  "flex h-8 w-8 items-center justify-center rounded-md pointer-coarse:h-10 pointer-coarse:w-10",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/60",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>

      {/* The view's ONE scroll area: upload strip and lists scroll together,
            so nothing is cut off at the bottom. The scroller sits inside a
            non-scrolling wrapper so the "more below" fade stays put. */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={listScrollRef}
          onScroll={syncScrollAffordance}
          role="region"
          aria-label={title}
          className="h-full overflow-y-auto overscroll-contain"
        >
          <div ref={listContentRef} className="space-y-1.5 p-1.5">
            {topSlot}
            {renderLists()}
          </div>
        </div>

        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {hasMoreBelow && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background via-background/80 to-transparent"
          />
        )}
      </div>
    </PickerView>
  );
}
