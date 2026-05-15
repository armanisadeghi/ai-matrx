/**
 * features/files/components/surfaces/PickerShell.tsx
 *
 * Picker host (file/folder picker) that adapts to the device.
 *   Desktop: Dialog.
 *   Mobile:  Drawer (bottom sheet) per .cursor/skills/ios-mobile-first/SKILL.md.
 *
 * DialogShell and DrawerShell are the two exported surfaces that delegate to
 * this adaptive host. The body (a minimal folder browser + file list) is
 * implemented here once and reused by both pickers in Phase 7.
 */

"use client";

import { useCallback, useState } from "react";
import { ArrowLeft, Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllFilesMap,
  selectAllFoldersMap,
  selectSortedChildrenOfFolder,
  selectSortedRootChildren,
} from "@/features/files/redux/selectors";
import { useFolderContents } from "@/features/files/hooks/useFolderContents";
import { FileIcon } from "@/features/files/components/core/FileIcon/FileIcon";
import { FileMeta } from "@/features/files/components/core/FileMeta/FileMeta";
import { FileBreadcrumbs } from "@/features/files/components/core/FileBreadcrumbs/FileBreadcrumbs";
import { useFileAsset } from "@/features/files/hooks/useFileAsset";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type PickerMode = "file" | "folder";

export interface PickerShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: PickerMode;
  /** Multi-select (files only; folders are always single). */
  multi?: boolean;
  initialFolderId?: string | null;
  onConfirm: (result: { fileIds: string[]; folderId: string | null }) => void;
  title?: string;
  description?: string;
  /** Constrain to extensions (e.g. ["pdf", "png"]). Files only. */
  allowedExtensions?: string[];
}

// ---------------------------------------------------------------------------
// Exported surfaces
// ---------------------------------------------------------------------------

/** Adaptive host — Dialog on desktop, Drawer on mobile. */
export function PickerShell(props: PickerShellProps) {
  const isMobile = useIsMobile();
  return isMobile ? <DrawerShell {...props} /> : <DialogShell {...props} />;
}

export function DialogShell(props: PickerShellProps) {
  const { open, onOpenChange, title = "Choose file", description } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px] max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <PickerBody {...props} />
      </DialogContent>
    </Dialog>
  );
}

export function DrawerShell(props: PickerShellProps) {
  const { open, onOpenChange, title = "Choose file", description } = props;
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85dvh]">
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          {description ? (
            <DrawerDescription>{description}</DrawerDescription>
          ) : null}
        </DrawerHeader>
        <div className="pb-safe">
          <PickerBody {...props} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Thumbnail for image files in the picker list
// ---------------------------------------------------------------------------

interface PickerFileThumbnailProps {
  fileId: string;
  publicUrl: string | null;
  mimeType: string | null;
  fileName: string;
}

function PickerFileThumbnail({ fileId, publicUrl, mimeType, fileName }: PickerFileThumbnailProps) {
  const isImage = mimeType?.startsWith("image/") ?? false;
  const { primaryUrl, isLoading } = useFileAsset(isImage && !publicUrl ? fileId : null, {
    signedUrlTtl: 3600,
  });
  const src = isImage ? (publicUrl ?? primaryUrl) : null;

  if (!isImage) return <FileIcon fileName={fileName} size={18} />;

  if (!src && isLoading) {
    return <div className="h-10 w-10 rounded-md shrink-0 bg-muted animate-pulse" />;
  }

  if (!src) return <FileIcon fileName={fileName} size={18} />;

  return (
    <div className="h-10 w-10 rounded-md overflow-hidden shrink-0 bg-muted border border-border/50">
      <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview panel — shown on the right when an image file is selected
// ---------------------------------------------------------------------------

interface PickerImagePreviewProps {
  fileId: string;
  publicUrl: string | null;
  fileName: string;
}

function PickerImagePreview({ fileId, publicUrl, fileName }: PickerImagePreviewProps) {
  const { primaryUrl, isLoading } = useFileAsset(publicUrl ? null : fileId, {
    signedUrlTtl: 3600,
  });
  const src = publicUrl ?? primaryUrl;

  if (isLoading && !src) {
    return (
      <div className="w-full h-full rounded-lg bg-muted/40 animate-pulse" />
    );
  }

  if (!src) {
    return (
      <div className="w-full h-full rounded-lg bg-muted/20 flex items-center justify-center text-xs text-muted-foreground">
        Preview unavailable
      </div>
    );
  }

  return (
    <div className="w-full h-full rounded-lg overflow-hidden bg-muted/10 flex items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={fileName}
        className="max-h-full max-w-full object-contain"
        draggable={false}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared body
// ---------------------------------------------------------------------------

function PickerBody({
  mode,
  multi,
  initialFolderId,
  onConfirm,
  onOpenChange,
  allowedExtensions,
}: PickerShellProps) {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(
    initialFolderId ?? null,
  );
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);

  const foldersById = useAppSelector(selectAllFoldersMap);
  const filesById = useAppSelector(selectAllFilesMap);
  const rootSorted = useAppSelector(selectSortedRootChildren);
  const folderSorted = useAppSelector((s) =>
    currentFolderId
      ? selectSortedChildrenOfFolder(s, currentFolderId)
      : { folderIds: [], fileIds: [] },
  );
  useFolderContents(currentFolderId);
  const children = currentFolderId ? folderSorted : rootSorted;

  const currentFolder = currentFolderId ? foldersById[currentFolderId] : null;

  const extOk = useCallback(
    (name: string) => {
      if (!allowedExtensions?.length) return true;
      const ext = name.toLowerCase().split(".").pop() ?? "";
      return allowedExtensions
        .map((e) => e.toLowerCase().replace(/^\./, ""))
        .includes(ext);
    },
    [allowedExtensions],
  );

  const handleToggleFile = useCallback(
    (fileId: string) => {
      setSelectedFileIds((prev) => {
        if (multi) {
          return prev.includes(fileId)
            ? prev.filter((id) => id !== fileId)
            : [...prev, fileId];
        }
        return prev.length === 1 && prev[0] === fileId ? [] : [fileId];
      });
    },
    [multi],
  );

  const handleConfirm = useCallback(() => {
    onConfirm({
      fileIds: mode === "file" ? selectedFileIds : [],
      folderId:
        mode === "folder"
          ? currentFolderId
          : (currentFolder?.id ?? currentFolderId),
    });
    onOpenChange(false);
  }, [
    mode,
    selectedFileIds,
    currentFolderId,
    currentFolder,
    onConfirm,
    onOpenChange,
  ]);

  const canConfirm = mode === "file" ? selectedFileIds.length > 0 : true;

  // Preview panel: show for the first selected image file.
  const selectedFileId = selectedFileIds[0] ?? null;
  const selectedFile = selectedFileId ? filesById[selectedFileId] : null;
  const showPreview =
    mode === "file" &&
    !!selectedFile &&
    (selectedFile.mimeType?.startsWith("image/") ?? false);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/20">
        {currentFolderId ? (
          <button
            type="button"
            onClick={() => setCurrentFolderId(currentFolder?.parentId ?? null)}
            aria-label="Up one level"
            className="flex h-8 w-8 items-center justify-center rounded hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : null}
        <FileBreadcrumbs
          folderId={currentFolderId}
          onNavigate={setCurrentFolderId}
        />
      </div>

      {/* Body: file list + preview panel side-by-side */}
      <div className="flex min-h-0 flex-1">
        <ul className={cn(
          "overflow-auto overscroll-contain divide-y max-h-[52dvh]",
          showPreview ? "w-[55%] border-r border-border" : "w-full",
        )}>
          {children.folderIds.length === 0 && children.fileIds.length === 0 ? (
            <li className="flex items-center justify-center p-6 text-sm text-muted-foreground">
              This folder is empty.
            </li>
          ) : null}
          {children.folderIds.map((id) => {
            const folder = foldersById[id];
            if (!folder) return null;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setCurrentFolderId(id)}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-accent/60"
                >
                  <FileIcon isFolder size={18} />
                  <span className="flex-1 truncate">{folder.folderName}</span>
                </button>
              </li>
            );
          })}
          {mode === "file"
            ? children.fileIds.map((id) => {
                const file = filesById[id];
                if (!file) return null;
                const disabled = !extOk(file.fileName);
                const selected = selectedFileIds.includes(id);
                const isImage = file.mimeType?.startsWith("image/") ?? false;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => handleToggleFile(id)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 text-left text-sm",
                        isImage ? "py-1.5" : "py-2",
                        disabled && "opacity-50",
                        !disabled && "hover:bg-accent/60",
                        selected && "bg-accent text-accent-foreground",
                      )}
                    >
                      <PickerFileThumbnail
                        fileId={file.id}
                        publicUrl={file.publicUrl}
                        mimeType={file.mimeType}
                        fileName={file.fileName}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{file.fileName}</div>
                        <FileMeta
                          file={{
                            fileSize: file.fileSize,
                            updatedAt: file.updatedAt,
                            visibility: file.visibility,
                          }}
                          hide={{ visibility: true }}
                          className="mt-0.5"
                        />
                      </div>
                      {selected ? (
                        <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                      ) : null}
                    </button>
                  </li>
                );
              })
            : null}
        </ul>

        {/* Image preview panel — appears when an image file is selected */}
        {showPreview && selectedFile && (
          <div className="w-[45%] p-3 flex flex-col gap-1.5 max-h-[52dvh]">
            <PickerImagePreview
              fileId={selectedFile.id}
              publicUrl={selectedFile.publicUrl}
              fileName={selectedFile.fileName}
            />
            <p className="text-[11px] text-muted-foreground truncate text-center">
              {selectedFile.fileName}
            </p>
          </div>
        )}
      </div>

      <PickerFooter
        onCancel={() => onOpenChange(false)}
        onConfirm={handleConfirm}
        canConfirm={canConfirm}
        confirmLabel={
          mode === "folder"
            ? "Choose this folder"
            : multi
              ? `Choose ${selectedFileIds.length || ""} file${selectedFileIds.length === 1 ? "" : "s"}`
              : "Choose"
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

interface PickerFooterProps {
  onCancel: () => void;
  onConfirm: () => void;
  canConfirm: boolean;
  confirmLabel: string;
}

function PickerFooter({
  onCancel,
  onConfirm,
  canConfirm,
  confirmLabel,
}: PickerFooterProps) {
  const isMobile = useIsMobile();
  const Wrapper = isMobile ? DrawerFooter : DialogFooter;
  return (
    <Wrapper>
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
      >
        <X className="h-4 w-4" aria-hidden="true" />
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={!canConfirm}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        <Check className="h-4 w-4" aria-hidden="true" />
        {confirmLabel}
      </button>
    </Wrapper>
  );
}
