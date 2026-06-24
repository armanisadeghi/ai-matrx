"use client";

/**
 * FilesResourcePicker
 *
 * Browse cloud files and pick one to attach as an AI resource reference.
 * Migrated in Phase 9: the internals now use the cloud-files system
 * (features/files/*) instead of supabase.storage — no more buckets, one
 * unified tree per user. The {onBack, onSelect} surface is unchanged so
 * every caller keeps working without edits.
 *
 * The returned selection shape is:
 *   { url, type, details }
 * where `url` is a 1-hour signed URL, `type` is the mime type, and
 * `details` is the EnhancedFileDetails produced by getFileDetailsByUrl(...)
 * (legacy utility — same as before).
 */

import React, { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Folder,
  Grid3x3,
  List,
  Loader2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getFileDetailsByUrl,
  type EnhancedFileDetails,
} from "@/utils/file-operations/constants";
import { idMatchesQuery } from "@/utils/search-scoring";
import { useAppSelector } from "@/lib/redux/hooks";
import { useCloudTree, useFileMutation } from "@/features/files";
import { MediaThumbnail } from "@/features/files/components/core/MediaThumbnail/MediaThumbnail";
import { FileMeta } from "@/features/files/components/core/FileMeta/FileMeta";
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
} from "@/features/files/redux/selectors";
import { isExcludedFromRecents } from "@/features/files/utils/folder-conventions";
import type { CloudFileRecord, CloudFolderRecord } from "@/features/files";

/** Same cap as `buildRows` recents filter in the files list. */
const RECENTS_CAP = 100;

type PickerViewMode = "list" | "grid";

// ---------------------------------------------------------------------------
// Types (preserve the legacy surface)
// ---------------------------------------------------------------------------

type FileSelection = {
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
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

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
  if (files.length === 0) return null;

  if (viewMode === "grid") {
    return (
      <div className={cn("grid grid-cols-3 gap-1.5 px-1", className)}>
        {files.map((file) => (
          <FileGridTile key={file.id} file={file} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      {files.map((file) => (
        <FileRow key={file.id} file={file} onSelect={onSelect} />
      ))}
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
  defaultOpen?: boolean;
}

function FolderNode({
  folderId,
  label,
  level,
  onFileSelect,
  viewMode,
  defaultOpen = false,
}: TreeNodeProps) {
  const [open, setOpen] = useState(defaultOpen);
  const foldersById = useAppSelector(selectAllFoldersMap);
  const filesById = useAppSelector(selectAllFilesMap);
  const childrenByFolderId = useAppSelector(selectChildrenByFolderId);
  const rootFolderIds = useAppSelector(selectRootFolderIds);
  const rootFileIds = useAppSelector(selectRootFileIds);

  const children = folderId
    ? (childrenByFolderId[folderId] ?? EMPTY_TREE_CHILDREN)
    : { folderIds: rootFolderIds, fileIds: rootFileIds };

  const childFiles = useMemo(
    () =>
      children.fileIds
        .map((id) => filesById[id])
        .filter((f): f is CloudFileRecord => !!f && !f.deletedAt),
    [children.fileIds, filesById],
  );

  const paddingLeft = level * 1.25;

  return (
    <div>
      {folderId !== null ? (
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          style={{ paddingLeft: `${paddingLeft}rem` }}
        >
          <div className="flex items-center min-w-0 w-full">
            <div className="flex items-center flex-shrink-0">
              <div className="w-4 h-4 mr-1">
                {open ? (
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
          {children.folderIds.length === 0 && children.fileIds.length === 0 ? (
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
}: FilesResourcePickerProps) {
  const currentUserId = useAppSelector(
    (s: unknown) => (s as { user?: { id?: string | null } }).user?.id ?? null,
  );
  useCloudTree(currentUserId ?? null);
  const treeStatus = useAppSelector(selectTreeStatus);
  const foldersById = useAppSelector(selectAllFoldersMap);
  const rootFolderIds = useAppSelector(selectRootFolderIds);
  const allFiles = useAppSelector(selectAllFilesArray);

  const fileMutation = useFileMutation();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<PickerViewMode>("list");
  const [isProcessing, setIsProcessing] = useState(false);

  const isSearching = searchQuery.trim().length > 0;

  const fileMatchesQuery = (file: CloudFileRecord, query: string) =>
    file.fileName.toLowerCase().includes(query) || idMatchesQuery(file, query);

  // Recent files — same rules as the files list Recents view.
  const recentFiles = useMemo(() => {
    const pool = allFiles.filter(
      (f) => !f.deletedAt && !isExcludedFromRecents(f.filePath),
    );
    pool.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    return pool.slice(0, RECENTS_CAP);
  }, [allFiles]);

  const searchMatchedFiles = useMemo(() => {
    if (!isSearching) return [];
    const query = searchQuery.toLowerCase();
    const pool = allFiles.filter(
      (f) => !f.deletedAt && fileMatchesQuery(f, query),
    );
    pool.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    return pool.slice(0, RECENTS_CAP);
  }, [allFiles, searchQuery, isSearching]);

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

  const filteredRootFolders = useMemo(() => {
    if (!isSearching) return rootFolders;
    const q = searchQuery.toLowerCase();
    return rootFolders.filter((f) => f.folderName.toLowerCase().includes(q));
  }, [rootFolders, searchQuery, isSearching]);

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

  const loading = treeStatus === "loading" || treeStatus === "idle";
  const error = treeStatus === "error";

  return (
    <div className="flex flex-col max-h-[min(460px,70dvh)]">
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
          Cloud Files
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
            type="text"
            placeholder="Search files and folders…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 text-xs pl-7 pr-2 bg-background border-gray-300 dark:border-gray-700"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin relative">
        {loading ? (
          <div className="flex items-center justify-center h-full py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="text-xs text-red-600 dark:text-red-400 text-center py-8">
            Error loading files
          </div>
        ) : isSearching ? (
          searchMatchedFiles.length === 0 &&
          filteredRootFolders.length === 0 ? (
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
              No files or folders match
            </div>
          ) : (
            <div className="p-1">
              {searchMatchedFiles.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-2 py-0.5">
                    Files
                  </div>
                  <FileListOrGrid
                    files={searchMatchedFiles}
                    viewMode={viewMode}
                    onSelect={handleFileSelect}
                  />
                </div>
              )}
              {filteredRootFolders.length > 0 && (
                <div className="mt-1">
                  <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-2 py-0.5">
                    Folders
                  </div>
                  {filteredRootFolders.map((folder) => (
                    <FolderNode
                      key={folder.id}
                      folderId={folder.id}
                      label={folder.folderName}
                      level={0}
                      onFileSelect={handleFileSelect}
                      viewMode={viewMode}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        ) : recentFiles.length === 0 && filteredRootFolders.length === 0 ? (
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
            No files yet
          </div>
        ) : (
          <div className="p-1">
            {recentFiles.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-2 py-0.5">
                  Recent
                </div>
                <FileListOrGrid
                  files={recentFiles}
                  viewMode={viewMode}
                  onSelect={handleFileSelect}
                />
              </div>
            )}
            {filteredRootFolders.length > 0 && (
              <div className="mt-1">
                <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-2 py-0.5">
                  Folders
                </div>
                {filteredRootFolders.map((folder) => (
                  <FolderNode
                    key={folder.id}
                    folderId={folder.id}
                    label={folder.folderName}
                    level={0}
                    onFileSelect={handleFileSelect}
                    viewMode={viewMode}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {isProcessing && (
          <div className="absolute inset-0 bg-white/80 dark:bg-zinc-900/80 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        )}
      </div>
    </div>
  );
}
