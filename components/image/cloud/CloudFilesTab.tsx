/**
 * components/image/cloud/CloudFilesTab.tsx
 *
 * Full cloud-files browser embedded inside the ImageManager modal.
 * Folder navigation on the left, contents on the right. Selection writes
 * back into the SelectedImagesProvider as `type: "cloud-file"` (with a
 * pre-resolved URL). Non-image MIMEs are disabled unless the caller
 * passes `allowFileTypes` containing the matching kind.
 *
 * We intentionally do NOT reuse `<FileTree>` / `<FileList>` here — those
 * components hook into the cloud-files Redux selection state which is
 * shared with the main `/files` page. This local navigator keeps the
 * modal's selection isolated and gives the user the same multi-select
 * feel as the rest of the ImageManager.
 */

"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  FolderClosed,
  Loader2,
  Search,
  ImageIcon,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectActiveUserId } from "@/lib/redux/selectors/userSelectors";
import {
  selectAllFilesMap,
  selectAllFoldersMap,
  selectSortedChildrenOfFolder,
  selectSortedRootChildren,
  selectTreeStatus,
} from "@/features/files/redux/selectors";
import { loadUserFileTree } from "@/features/files/redux/thunks";
import { useFolderContents } from "@/features/files/hooks/useFolderContents";
import {
  isImageMime,
  resolveMime,
} from "@/features/files/utils/file-types";
import type {
  CloudFileRecord,
  CloudFolderRecord,
} from "@/features/files/types";
import {
  useSelectedImages,
  type ImageSource,
} from "@/components/image/context/SelectedImagesProvider";
import {
  buildCloudImageSource,
  resolveCloudFileUrl,
} from "@/components/image/cloud/resolveCloudFileUrl";
import { buildCloudFilesBrowsePayload } from "@/components/image/cloud/cloudFilesBrowsePayload";
import { useBrowseAction } from "@/features/image-manager/browse/BrowseImageProvider";
import { toast } from "sonner";
import { CloudFilesBrowserTable } from "./CloudFilesBrowserTable";
import { isCloudFileSelectable } from "./cloudFilesBrowserUtils";

export type AllowedFileKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "document"
  | "any";

export interface CloudFilesTabProps {
  /**
   * Which file kinds are selectable. The "image" kind is always shown
   * with thumbnails; non-image kinds appear in the listing but are only
   * clickable when included here. Default: `["image"]`.
   */
  allowFileTypes?: AllowedFileKind[];
  /** Initial folder to land in. Default: root. */
  initialFolderId?: string | null;
}

export function CloudFilesTab({
  allowFileTypes = ["image"],
  initialFolderId = null,
}: CloudFilesTabProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const userId = useAppSelector(selectActiveUserId);
  const treeStatus = useAppSelector(selectTreeStatus);

  const foldersById = useAppSelector(selectAllFoldersMap);
  const filesById = useAppSelector(selectAllFilesMap);
  const rootSorted = useAppSelector(selectSortedRootChildren);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(
    initialFolderId,
  );
  const [query, setQuery] = useState("");
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const {
    selectedImages,
    isSelected,
    toggleImage,
    addImage,
    clearImages,
    selectionMode,
  } = useSelectedImages();
  const browse = useBrowseAction();

  // Hydrate the tree if it hasn't loaded yet (e.g., modal opened on a
  // route that doesn't mount the realtime provider).
  useEffect(() => {
    if (!userId) return;
    if (treeStatus === "idle" || treeStatus === "error") {
      void dispatch(loadUserFileTree({ userId }));
    }
  }, [userId, treeStatus, dispatch]);

  // Lazily fetch the contents of the current folder.
  useFolderContents(currentFolderId);

  const folderSorted = useAppSelector((s) =>
    currentFolderId
      ? selectSortedChildrenOfFolder(s, currentFolderId)
      : { folderIds: [], fileIds: [] },
  );
  const sorted = currentFolderId ? folderSorted : rootSorted;
  const currentFolder = currentFolderId
    ? (foldersById[currentFolderId] ?? null)
    : null;

  // Build the visible rows (folders + files), filtered by query when set.
  const { folderRows, fileRows } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const folders = sorted.folderIds
      .map((id) => foldersById[id])
      .filter((f): f is CloudFolderRecord => Boolean(f && !f.deletedAt))
      .filter((f) => !q || f.folderName.toLowerCase().includes(q));
    const files = sorted.fileIds
      .map((id) => filesById[id])
      .filter((f): f is CloudFileRecord => Boolean(f && !f.deletedAt))
      .filter((f) => !q || f.fileName.toLowerCase().includes(q));
    return { folderRows: folders, fileRows: files };
  }, [sorted, foldersById, filesById, query]);

  const handleRowClick = async (file: CloudFileRecord) => {
    // Browse mode: open image rows in the floating viewer; non-image rows
    // we leave alone (clicking does nothing — the file is read-only here).
    if (selectionMode === "none") {
      const mime = resolveMime(file.mimeType, file.fileName);
      if (!isImageMime(mime)) return;
      try {
        setResolvingId(file.id);
        const imageRows = fileRows.filter((f) =>
          isImageMime(resolveMime(f.mimeType, f.fileName)),
        );
        const payload = await buildCloudFilesBrowsePayload({
          imageRows,
          activeFileId: file.id,
          resolveUrl: (fileId) => resolveCloudFileUrl(store, fileId),
        });
        if (payload.images.length === 0) {
          toast.error("Couldn't load that image");
          return;
        }
        browse({ ...payload, title: file.fileName });
      } finally {
        setResolvingId(null);
      }
      return;
    }

    // Selection modes (single / multiple)
    if (!isCloudFileSelectable(file, allowFileTypes)) return;
    const sourceId = `cloud:${file.id}`;
    if (isSelected(sourceId)) {
      toggleImage({
        type: "cloud-file",
        url: file.publicUrl ?? "",
        id: sourceId,
      } as ImageSource);
      return;
    }
    try {
      setResolvingId(file.id);
      if (selectionMode === "single") clearImages();
      const resolved = await resolveCloudFileUrl(store, file.id);
      addImage(buildCloudImageSource(file, resolved));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not load that file";
      toast.error(message);
    } finally {
      setResolvingId(null);
    }
  };

  const isLoading = treeStatus === "loading" || treeStatus === "idle";
  const isEmpty = folderRows.length === 0 && fileRows.length === 0;
  const selectedImageIds = useMemo(
    () => new Set(selectedImages.map((image) => image.id)),
    [selectedImages],
  );
  const disabledFileIds = useMemo(
    () =>
      new Set(
        fileRows
          .filter((file) =>
            selectionMode === "none"
              ? !isImageMime(resolveMime(file.mimeType, file.fileName))
              : !isCloudFileSelectable(file, allowFileTypes),
          )
          .map((file) => file.id),
      ),
    [allowFileTypes, fileRows, selectionMode],
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header — breadcrumbs + search */}
      <div className="border-b border-border px-4 py-2 flex items-center gap-2 flex-wrap">
        <BreadcrumbsTrail
          currentFolder={currentFolder}
          foldersById={foldersById}
          onNavigate={setCurrentFolderId}
        />
        <div className="flex-1" />
        <Link
          href="/files/photos"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 px-2 h-8 rounded-md text-xs font-medium text-muted-foreground border border-border hover:bg-accent hover:text-foreground transition-colors"
          title="Open the Photos-only view in a new tab"
        >
          <ImageIcon className="h-3.5 w-3.5" />
          Photos
          <ExternalLink className="h-3 w-3 opacity-60" />
        </Link>
        <div className="relative w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter in folder..."
            className="pl-8 h-8 text-base"
            style={{ fontSize: "16px" }}
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span className="text-sm">Loading your cloud...</span>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
              <FolderClosed className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-base font-medium text-foreground mb-1">
              {query ? "No matches in this folder" : "This folder is empty"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {query
                ? "Try a different filter, or navigate to another folder."
                : currentFolderId
                  ? "Upload a file to fill this folder up."
                  : "Your cloud is empty — upload something from the Upload tab."}
            </p>
            {currentFolderId ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() =>
                  setCurrentFolderId(currentFolder?.parentId ?? null)
                }
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                Back
              </Button>
            ) : null}
          </div>
        ) : (
          <CloudFilesBrowserTable
            folders={folderRows}
            files={fileRows}
            currentUserId={userId}
            resolvingId={resolvingId}
            selectedImageIds={selectedImageIds}
            disabledFileIds={disabledFileIds}
            onOpenFolder={setCurrentFolderId}
            onActivateFile={handleRowClick}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local breadcrumbs — built from the folder ancestry chain.
// ---------------------------------------------------------------------------

interface BreadcrumbsTrailProps {
  currentFolder: CloudFolderRecord | null;
  foldersById: Record<string, CloudFolderRecord>;
  onNavigate: (folderId: string | null) => void;
}

function BreadcrumbsTrail({
  currentFolder,
  foldersById,
  onNavigate,
}: BreadcrumbsTrailProps) {
  const ancestry = useMemo(() => {
    const chain: CloudFolderRecord[] = [];
    let f: CloudFolderRecord | null = currentFolder;
    while (f) {
      chain.unshift(f);
      f = f.parentId ? (foldersById[f.parentId] ?? null) : null;
    }
    return chain;
  }, [currentFolder, foldersById]);

  return (
    <nav className="flex items-center gap-1 text-sm overflow-x-auto">
      <button
        type="button"
        onClick={() => onNavigate(null)}
        className={cn(
          "px-2 py-1 rounded hover:bg-accent transition-colors",
          ancestry.length === 0
            ? "font-medium text-foreground"
            : "text-muted-foreground",
        )}
      >
        My Cloud
      </button>
      {ancestry.map((folder, idx) => {
        const isLast = idx === ancestry.length - 1;
        return (
          <React.Fragment key={folder.id}>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <button
              type="button"
              onClick={() => onNavigate(folder.id)}
              className={cn(
                "px-2 py-1 rounded hover:bg-accent transition-colors truncate max-w-[160px]",
                isLast
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {folder.folderName}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
