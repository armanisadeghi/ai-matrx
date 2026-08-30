/**
 * features/files/components/surfaces/EmbeddedShell.tsx
 *
 * Inline embed — no sidebar, no breadcrumbs, no preview panel. Renders a
 * scoped FileList (and optionally a Dropzone) for use inside other pages
 * like "attached files" on a task, or "assets" inside an agent app.
 *
 * Selection state is isolated: callers pass an `onSelect` / `onActivate`
 * instead of hooking into the global Redux active-file state. This is the
 * only surface that does NOT dispatch setActiveFileId on selection.
 */

"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllFilesArray,
  selectAllFoldersMap,
} from "@/features/files/redux/selectors";
import { FileList } from "@/features/files/components/core/FileList/FileList";
import { FileUploadDropzone } from "@ai-matrx/media/react";
import { DropzoneAcquisitionActions } from "@/features/files/components/core/FileAcquisition/DropzoneAcquisitionActions";
import { FileIcon } from "@ai-matrx/media/react";
import { FileMeta } from "@/features/files/components/core/FileMeta/FileMeta";

export interface EmbeddedShellProps {
  /**
   * Scope mode:
   *  - "folder": show the contents of a specific folder (like FileList).
   *  - "owner":  flat list of files owned by the given user id.
   *  - "custom": pass `filter` to narrow the set yourself.
   */
  scope:
    | { kind: "folder"; folderId: string | null }
    | { kind: "owner"; userId: string }
    | {
        kind: "custom";
        filter: (file: ReturnType<typeof useAllFiles>[number]) => boolean;
      };
  onSelectFile?: (fileId: string) => void;
  onActivateFile?: (fileId: string) => void;
  /** Show a dropzone above the list. Default false. */
  showDropzone?: boolean;
  /** Upload target folder. Defaults to scope.folderId if scope is "folder". */
  uploadFolderId?: string | null;
  /** Max height (otherwise fills parent). */
  maxHeight?: string;
  className?: string;
  emptyState?: React.ReactNode;
}

function useAllFiles() {
  return useAppSelector(selectAllFilesArray);
}

export function EmbeddedShell({
  scope,
  onSelectFile,
  onActivateFile,
  showDropzone,
  uploadFolderId,
  maxHeight,
  className,
  emptyState,
}: EmbeddedShellProps) {
  // Folder mode delegates to the proper FileList so we inherit sort, DnD,
  // sort headers, virtualization-ready rows, etc.
  if (scope.kind === "folder") {
    const parentFolderId = uploadFolderId ?? scope.folderId;
    return (
      <div
        className={cn("flex flex-col overflow-hidden", className)}
        style={maxHeight ? { maxHeight } : undefined}
      >
        {showDropzone ? (
          <FileUploadDropzone
            uploadOptions={{ parentFolderId }}
            mode="inline"
            className="m-2"
            actions={
              <DropzoneAcquisitionActions uploadOptions={{ parentFolderId }} />
            }
          />
        ) : null}
        <FileList
          folderId={scope.folderId}
          onActivateFile={onActivateFile}
          className="flex-1"
          emptyState={emptyState}
        />
      </div>
    );
  }

  // Owner and custom render a flat list since they span folders.
  return (
    <FlatEmbeddedList
      scope={scope}
      onSelectFile={onSelectFile}
      onActivateFile={onActivateFile}
      maxHeight={maxHeight}
      className={className}
      emptyState={emptyState}
    />
  );
}

// ---------------------------------------------------------------------------
// Flat list for owner / custom scopes.
// ---------------------------------------------------------------------------

interface FlatEmbeddedListProps {
  scope:
    | { kind: "owner"; userId: string }
    | {
        kind: "custom";
        filter: (f: ReturnType<typeof useAllFiles>[number]) => boolean;
      };
  onSelectFile?: (fileId: string) => void;
  onActivateFile?: (fileId: string) => void;
  maxHeight?: string;
  className?: string;
  emptyState?: React.ReactNode;
}

function FlatEmbeddedList({
  scope,
  onSelectFile,
  onActivateFile,
  maxHeight,
  className,
  emptyState,
}: FlatEmbeddedListProps) {
  const files = useAppSelector(selectAllFilesArray);
  const folders = useAppSelector(selectAllFoldersMap);
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);

  const filtered = files.filter((f) => {
    if (f.deletedAt) return false;
    if (scope.kind === "owner") return f.ownerId === scope.userId;
    return scope.filter(f);
  });

  const handleClick = useCallback(
    (fileId: string) => {
      setLocalSelectedId(fileId);
      onSelectFile?.(fileId);
    },
    [onSelectFile],
  );

  if (filtered.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-sm text-muted-foreground p-6",
          className,
        )}
        style={maxHeight ? { maxHeight } : undefined}
      >
        {emptyState ?? "No files."}
      </div>
    );
  }

  return (
    <ul
      className={cn("divide-y overflow-auto overscroll-contain", className)}
      style={maxHeight ? { maxHeight } : undefined}
    >
      {filtered.map((file) => {
        const parent = file.parentFolderId
          ? folders[file.parentFolderId]
          : null;
        const isSelected = localSelectedId === file.id;
        return (
          <li key={file.id}>
            <button
              type="button"
              onClick={() => handleClick(file.id)}
              onDoubleClick={() => onActivateFile?.(file.id)}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2 text-left",
                "hover:bg-accent/60 active:bg-accent",
                isSelected && "bg-accent text-accent-foreground",
              )}
            >
              <FileIcon fileName={file.fileName} size={16} />
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm">{file.fileName}</div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {parent ? (
                    <span className="truncate max-w-[40ch]">
                      {parent.folderPath}
                    </span>
                  ) : null}
                  <FileMeta
                    file={{
                      fileSize: file.fileSize,
                      updatedAt: file.updatedAt,
                      visibility: file.visibility,
                    }}
                    hide={{ visibility: true }}
                  />
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
