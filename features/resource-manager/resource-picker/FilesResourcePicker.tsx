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
  File,
  Folder,
  Loader2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getFileDetailsByUrl,
  type EnhancedFileDetails,
} from "@/utils/file-operations/constants";
import { useAppSelector } from "@/lib/redux/hooks";
import * as Api from "@/features/files/api";
import { useCloudTree } from "@/features/files";
import {
  selectAllFilesMap,
  selectAllFoldersMap,
  selectChildrenByFolderId,
  selectRootFileIds,
  selectRootFolderIds,
  selectTreeStatus,
} from "@/features/files/redux/selectors";
import type {
  CloudFileRecord,
  CloudFolderRecord,
} from "@/features/files";

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

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

// ---------------------------------------------------------------------------
// Tree node
// ---------------------------------------------------------------------------

interface TreeNodeProps {
  folderId: string | null; // null = root
  label: string;
  level: number;
  onFileSelect: (file: CloudFileRecord) => void;
  defaultOpen?: boolean;
}

function FolderNode({
  folderId,
  label,
  level,
  onFileSelect,
  defaultOpen = false,
}: TreeNodeProps) {
  const [open, setOpen] = useState(defaultOpen);
  const foldersById = useAppSelector(selectAllFoldersMap);
  const filesById = useAppSelector(selectAllFilesMap);
  const childrenByFolderId = useAppSelector(selectChildrenByFolderId);
  const rootFolderIds = useAppSelector(selectRootFolderIds);
  const rootFileIds = useAppSelector(selectRootFileIds);

  const children = folderId
    ? (childrenByFolderId[folderId] ?? { folderIds: [], fileIds: [] })
    : { folderIds: rootFolderIds, fileIds: rootFileIds };

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
                  />
                );
              })}
              {children.fileIds.map((id) => {
                const file = filesById[id];
                if (!file || file.deletedAt) return null;
                return (
                  <button
                    key={id}
                    onClick={() => onFileSelect(file)}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                    style={{
                      paddingLeft: `${
                        folderId === null ? 0 : (level + 1) * 1.25
                      }rem`,
                    }}
                  >
                    <div className="flex items-center min-w-0 w-full">
                      <div className="flex items-center flex-shrink-0">
                        <div className="w-4 h-4 mr-1" />
                        <File className="h-3.5 w-3.5 mr-2 text-gray-600 dark:text-gray-400" />
                      </div>
                      <span className="text-xs truncate flex-1 text-gray-900 dark:text-gray-100">
                        {file.fileName}
                      </span>
                      {file.fileSize ? (
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 ml-2 flex-shrink-0">
                          {formatSize(file.fileSize)}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
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

  const [searchQuery, setSearchQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

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
    if (!searchQuery.trim()) return rootFolders;
    const q = searchQuery.toLowerCase();
    return rootFolders.filter((f) => f.folderName.toLowerCase().includes(q));
  }, [rootFolders, searchQuery]);

  const handleFileSelect = async (file: CloudFileRecord) => {
    setIsProcessing(true);
    try {
      // Fetch a short-lived signed URL. Unlike legacy storage, every
      // cloud-files URL is signed — we don't need the "public vs private"
      // dance the old picker did.
      const { data } = await Api.Files.getSignedUrl(file.id, {
        expiresIn: 3600,
      });
      const fileUrl = data.url;

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
      </div>

      {/* Search */}
      <div className="px-2 py-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <Input
            type="text"
            placeholder="Filter top-level folders…"
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
        ) : filteredRootFolders.length === 0 ? (
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
            {searchQuery ? "No folders match" : "No files yet"}
          </div>
        ) : (
          <div className="p-1">
            {/* Render each top-level folder as an expandable tree. */}
            {filteredRootFolders.map((folder) => (
              <FolderNode
                key={folder.id}
                folderId={folder.id}
                label={folder.folderName}
                level={0}
                onFileSelect={handleFileSelect}
              />
            ))}
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
