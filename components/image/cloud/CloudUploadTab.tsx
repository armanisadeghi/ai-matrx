/**
 * components/image/cloud/CloudUploadTab.tsx
 *
 * Single consolidated image upload surface that replaces the legacy
 * "Upload", "Paste", and "Quick Upload" tabs. Wraps the official
 * `<ImageAssetUploader mode="cloud">` so the Image Manager uses one
 * consistent image-first dropzone while still flowing through the
 * cloud-files upload pipeline.
 *
 * Files land in `defaultUploadFolderPath` (default "Images/Uploads") —
 * resolved once via `ensureFolderPath`. Users can override the
 * destination with the "Change" button which calls the global
 * `openFolderPicker()`.
 *
 * The destination row renders the path text immediately (no "Preparing
 * folder..." spinner) — folder resolution happens silently in the
 * background so the dropzone has a `parentFolderId` ready when the user
 * actually drops a file.
 */

"use client";

import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  selectAllFoldersMap,
  selectFileById,
} from "@/features/files/redux/selectors";
import { ensureFolderPath } from "@/features/files/redux/thunks";
import { openFolderPicker } from "@/features/files/components/pickers/cloudFilesPickerOpeners";
import { ImageAssetUploader } from "@/components/official/ImageAssetUploader";
import {
  useSelectedImages,
} from "@/components/image/context/SelectedImagesProvider";
import {
  buildCloudImageSource,
  resolveCloudFileUrl,
} from "@/components/image/cloud/resolveCloudFileUrl";
import type { Visibility } from "@/features/files/types";
import { Base64DecoderShell } from "@/features/image-studio/components/Base64DecoderShell";
import { toast } from "sonner";
import { extractErrorMessage } from "@/utils/errors";

export interface CloudUploadTabProps {
  /** Logical folder path (slash-delimited) for uploads. Default: `Images/Uploads`. */
  defaultUploadFolderPath?: string;
  /**
   * Pre-resolved folder id. When provided, the path resolution step is
   * skipped. Useful when callers already know the folder.
   */
  defaultUploadFolderId?: string | null;
  /** Visibility for newly uploaded files. Default `"private"`. */
  visibility?: Visibility;
  /** Accepted MIME types (e.g. `["image/*"]`). Default `["image/*"]`. */
  accept?: string[];
  /** Hide the folder selector chip (callers that lock destination). */
  hideFolderControls?: boolean;
}

const DEFAULT_PATH = "Images/Uploads";

export function CloudUploadTab({
  defaultUploadFolderPath,
  defaultUploadFolderId,
  visibility = "private",
  accept = ["image/*"],
  hideFolderControls,
}: CloudUploadTabProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const foldersById = useAppSelector(selectAllFoldersMap);
  const { addImage, selectionMode, clearImages } = useSelectedImages();

  const targetPath = (defaultUploadFolderPath ?? DEFAULT_PATH).replace(
    /^\/+|\/+$/g,
    "",
  );

  const [folderId, setFolderId] = useState<string | null>(
    defaultUploadFolderId ?? null,
  );
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [recentlyUploaded, setRecentlyUploaded] = useState<string[]>([]);
  const [base64Open, setBase64Open] = useState(false);

  const folderRecord = folderId ? (foldersById[folderId] ?? null) : null;
  const folderLabel = folderRecord ? folderRecord.folderName : targetPath;
  const folderPathDisplay = folderRecord ? folderRecord.folderPath : targetPath;

  // Resolve the default folder path → folder id on mount when not pre-provided.
  useEffect(() => {
    if (folderId || resolving || hideFolderControls === true) return;
    if (defaultUploadFolderId) {
      setFolderId(defaultUploadFolderId);
      return;
    }
    let cancelled = false;
    setResolving(true);
    setResolveError(null);
    dispatch(
      ensureFolderPath({
        folderPath: targetPath,
        visibility,
      }),
    )
      .unwrap()
      .then((id) => {
        if (!cancelled) setFolderId(id);
      })
      .catch((err) => {
        if (!cancelled) {
          // Fall back to root — uploads will still work, just at root.
          setResolveError(extractErrorMessage(err));
          setFolderId(null);
        }
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    dispatch,
    targetPath,
    visibility,
    folderId,
    resolving,
    defaultUploadFolderId,
    hideFolderControls,
  ]);

  const handleChangeFolder = async () => {
    try {
      const picked = await openFolderPicker({
        title: "Choose upload folder",
        description: "Files you upload will be saved here.",
        initialFolderId: folderId,
      });
      if (typeof picked === "string") {
        setFolderId(picked);
      } else if (picked === null) {
        // User chose "root".
        setFolderId(null);
      }
    } catch (err) {
      toast.error(extractErrorMessage(err));
    }
  };

  const handleUploaded = async (fileIds: string[]) => {
    if (!fileIds.length) return;
    setRecentlyUploaded((prev) => [...fileIds, ...prev].slice(0, 8));
    if (selectionMode === "single") clearImages();

    // Resolve each file → ImageSource and feed into the picker selection.
    for (const fileId of fileIds) {
      try {
        const file = selectFileById(store.getState(), fileId);
        if (!file) continue;
        const resolved = await resolveCloudFileUrl(store, fileId);
        addImage(buildCloudImageSource(file, resolved));
        if (selectionMode === "single") break;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          `[ImageManager] Could not resolve uploaded file ${fileId}:`,
          err,
        );
      }
    }
    toast.success(
      fileIds.length === 1
        ? "Uploaded — added to your selection"
        : `Uploaded ${fileIds.length} files — added to selection`,
    );
  };

  const handleError = (message: string) => {
    toast.error(message);
  };

  // Show the path directly so the chip renders immediately with no
  // "Preparing folder..." spinner. Once the folder resolves, swap to its
  // canonical name from the store; until then the user sees the path they
  // chose. If resolution failed, surface a discreet inline note.
  const destinationDisplay = folderRecord
    ? folderRecord.folderName
    : targetPath || "Root";

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto p-4 space-y-4">
        <ImageAssetUploader
          mode="cloud"
          parentFolderId={folderId}
          visibility={visibility}
          accept={accept}
          enablePaste
          multiple
          onUploaded={handleUploaded}
          onError={handleError}
          label="Upload"
          allowUrlPaste={false}
        />

        {!hideFolderControls ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate" title={folderPathDisplay}>
              Saves to{" "}
              <span className="text-foreground font-medium">
                {destinationDisplay}
              </span>
            </span>
            <button
              type="button"
              onClick={handleChangeFolder}
              className={cn(
                "text-primary hover:underline transition-colors",
                resolving && "opacity-50 cursor-wait",
              )}
              disabled={resolving}
            >
              Change
            </button>
            {resolveError ? (
              <span className="text-destructive truncate" title={resolveError}>
                · couldn't prepare folder, uploads go to root
              </span>
            ) : null}
          </div>
        ) : null}

        {recentlyUploaded.length > 0 ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-success flex-shrink-0" />
            <span>{recentlyUploaded.length} uploaded — added to selection</span>
          </div>
        ) : null}

        <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
          <button
            type="button"
            onClick={() => setBase64Open((v) => !v)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-accent/50 transition-colors"
            aria-expanded={base64Open}
          >
            {base64Open ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <Code2 className="h-3.5 w-3.5 text-amber-500" />
            <span>Paste base64 instead</span>
            <span className="ml-auto text-[11px] font-normal text-muted-foreground">
              data:image/… or raw base64
            </span>
          </button>
          {base64Open ? (
            <div className="border-t border-border bg-background">
              <Base64DecoderShell defaultFolder="from-base64" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
