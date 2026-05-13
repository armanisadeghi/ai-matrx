/**
 * features/files/components/surfaces/dropbox/FileGridCell.tsx
 *
 * One cell in the Dropbox-style grid view. Shows an image thumbnail when the
 * file is an image (via `useFileSrc`), else a large file icon. Filename +
 * "EXT • size" meta line underneath, matching the Dropbox layout.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Copy, MoreHorizontal, Share2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { formatFileSize } from "@/features/files/utils/format";
import { MediaThumbnail } from "@/features/files/components/core/MediaThumbnail/MediaThumbnail";
import { FileRagBadge } from "@/features/files/components/core/FileBadges/FileRagBadge";
import { FileContextMenu } from "@/features/files/components/core/FileContextMenu/FileContextMenu";
import { FolderContextMenu } from "@/features/files/components/core/FolderContextMenu/FolderContextMenu";
import { useFolderActions } from "@/features/files/components/core/FileActions/useFolderActions";
import {
  FileRowContextMenu,
  FolderRowContextMenu,
} from "@/features/files/components/core/RowContextMenu/RowContextMenu";
import { useFileActions } from "@/features/files/components/core/FileActions/useFileActions";
import type {
  CloudFileRecord,
  CloudFolderRecord,
} from "@/features/files/types";
import { FolderIconWithMembers } from "./FolderIconWithMembers";

export interface FileGridCellProps {
  kind: "file" | "folder";
  file?: CloudFileRecord;
  folder?: CloudFolderRecord;
  selected: boolean;
  /** True when this file is currently open in the preview pane. */
  isPreviewActive?: boolean;
  /**
   * True when this item has visual focus (Google-Drive-style blue ring).
   * Set automatically after create/upload so the user can see the new item.
   */
  isFocused?: boolean;
  isShared: boolean;
  onToggleSelected: () => void;
  onActivate: () => void;
  onOpenShare: () => void;
  /** Search-mode breadcrumb under the cell title — when null/undefined the
   * cell renders its existing meta line (ext • size). */
  parentPath?: string | null;
}

export function FileGridCell(props: FileGridCellProps) {
  if (props.kind === "file" && props.file) {
    return <GridFile {...props} file={props.file} />;
  }
  if (props.kind === "folder" && props.folder) {
    return <GridFolder {...props} folder={props.folder} />;
  }
  return null;
}

interface GridFileProps extends FileGridCellProps {
  file: CloudFileRecord;
}

function GridFile({
  file,
  selected,
  isPreviewActive,
  isFocused,
  isShared,
  onToggleSelected,
  onActivate,
  onOpenShare,
  parentPath,
}: GridFileProps) {
  const [hovered, setHovered] = useState(false);
  const actions = useFileActions(file.id);
  const ext = file.fileName.split(".").pop()?.toUpperCase() ?? "FILE";
  const cellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isFocused) {
      cellRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [isFocused]);

  // File cells are draggable. The activation distance on the parent
  // PointerSensor (6px) preserves single-click selection.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `grid-file-${file.id}`,
    data: { type: "file", id: file.id },
  });

  const mergeRef = (node: HTMLDivElement | null) => {
    (cellRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    setNodeRef(node);
  };

  return (
    <FileRowContextMenu fileId={file.id}>
      <div
        ref={mergeRef}
        className={cn(
          "group flex flex-col rounded-lg border bg-card overflow-hidden transition-shadow",
          isPreviewActive
            ? "ring-2 ring-primary bg-primary/5"
            : isFocused
              ? "ring-2 ring-primary/60 bg-primary/8"
              : selected
                ? "ring-2 ring-ring"
                : null,
          "hover:shadow-sm",
          isDragging && "opacity-50",
        )}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDoubleClick={onActivate}
        {...attributes}
        {...listeners}
      >
        <div className="relative aspect-[4/3] bg-muted/50">
          {/*
          Thumbnail strategy is sourced from the file-type registry —
          adding a new visual treatment for a file kind (e.g. PDF first
          page, audio waveform) is a single registry edit, never an edit
          to this component. See features/files/utils/file-types.ts.
        */}
          <div className="absolute inset-0" onClick={onActivate}>
            <MediaThumbnail
              file={file}
              iconSize={48}
              className="h-full w-full"
            />
          </div>

          <div className="absolute left-2 top-2">
            <Checkbox
              checked={selected}
              onCheckedChange={onToggleSelected}
              aria-label={`Select ${file.fileName}`}
              className={cn(
                "bg-background/90 backdrop-blur",
                selected
                  ? "opacity-100"
                  : hovered
                    ? "opacity-100"
                    : "opacity-0",
              )}
            />
          </div>

          <div
            className={cn(
              "absolute right-2 top-2 flex items-center gap-1 transition-opacity",
              hovered ? "opacity-100" : "opacity-0",
            )}
          >
            <GridIconButton
              label="Share"
              onClick={(e) => {
                e.stopPropagation();
                onOpenShare();
              }}
            >
              <Share2 className="h-3.5 w-3.5" />
            </GridIconButton>
            <GridIconButton
              label="Copy link"
              onClick={(e) => {
                e.stopPropagation();
                void actions.copyShareUrl();
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </GridIconButton>
            <GridIconButton label="Star" title="Coming soon" disabled>
              <Star className="h-3.5 w-3.5" />
            </GridIconButton>
            <FileContextMenu fileId={file.id}>
              <GridIconButton label="More">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </GridIconButton>
            </FileContextMenu>
          </div>
        </div>

        <div className="px-3 py-2">
          <span className="flex items-center gap-1 min-w-0">
            <p className="truncate text-sm font-medium">{file.fileName}</p>
            <FileRagBadge fileId={file.id} className="shrink-0" />
          </span>
          {parentPath ? (
            <p
              className="truncate text-xs text-muted-foreground"
              title={`In ${parentPath}`}
            >
              in {parentPath}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {ext} • {formatFileSize(file.fileSize)}
            </p>
          )}
        </div>

        {isShared ? (
          <div className="absolute bottom-2 right-2 pointer-events-none opacity-70">
            <FolderIconWithMembers isShared size={12} />
          </div>
        ) : null}
      </div>
    </FileRowContextMenu>
  );
}

interface GridFolderProps extends FileGridCellProps {
  folder: CloudFolderRecord;
}

function GridFolder({
  folder,
  selected,
  isFocused,
  isShared,
  onToggleSelected,
  onActivate,
  onOpenShare,
  parentPath,
}: GridFolderProps) {
  const [hovered, setHovered] = useState(false);
  const folderActions = useFolderActions(folder.id);
  const cellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isFocused) {
      cellRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [isFocused]);

  // Folder cells are both drop targets AND draggable. Drop = move file/
  // folder into here. Drag = move this folder under another folder.
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `grid-folder-${folder.id}`,
    data: { type: "folder", id: folder.id },
  });
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `grid-folder-drag-${folder.id}`,
    data: { type: "folder", id: folder.id },
  });
  const setMergedRef = (node: HTMLDivElement | null) => {
    (cellRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    setDropRef(node);
    setDragRef(node);
  };

  return (
    <FolderRowContextMenu folderId={folder.id}>
      <div
        ref={setMergedRef}
        className={cn(
          "group flex flex-col rounded-lg border bg-card overflow-hidden transition-shadow",
          isFocused
            ? "ring-2 ring-primary/60 bg-primary/8"
            : selected
              ? "ring-2 ring-ring"
              : null,
          "hover:shadow-sm",
          isOver && "ring-2 ring-primary bg-primary/5",
          isDragging && "opacity-50",
        )}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDoubleClick={onActivate}
        {...attributes}
        {...listeners}
      >
        <div
          className="relative aspect-[4/3] bg-primary/5 flex items-center justify-center"
          onClick={onActivate}
        >
          <FolderIconWithMembers isShared={isShared} size={56} />

          <div className="absolute left-2 top-2">
            <Checkbox
              checked={selected}
              onCheckedChange={onToggleSelected}
              aria-label={`Select ${folder.folderName}`}
              className={cn(
                "bg-background/90 backdrop-blur",
                selected
                  ? "opacity-100"
                  : hovered
                    ? "opacity-100"
                    : "opacity-0",
              )}
            />
          </div>

          <div
            className={cn(
              "absolute right-2 top-2 flex items-center gap-1 transition-opacity",
              hovered ? "opacity-100" : "opacity-0",
            )}
          >
            <GridIconButton
              label="Share"
              onClick={(e) => {
                e.stopPropagation();
                onOpenShare();
              }}
            >
              <Share2 className="h-3.5 w-3.5" />
            </GridIconButton>
            <GridIconButton
              label="Copy link"
              onClick={(e) => {
                e.stopPropagation();
                void folderActions.copyShareUrl();
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </GridIconButton>
            <GridIconButton label="Star" title="Coming soon" disabled>
              <Star className="h-3.5 w-3.5" />
            </GridIconButton>
            <FolderContextMenu folderId={folder.id}>
              <GridIconButton label="More" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="h-3.5 w-3.5" />
              </GridIconButton>
            </FolderContextMenu>
          </div>
        </div>

        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium">{folder.folderName}</p>
          {parentPath ? (
            <p
              className="truncate text-xs text-muted-foreground"
              title={`In ${parentPath}`}
            >
              in {parentPath}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Folder</p>
          )}
        </div>
      </div>
    </FolderRowContextMenu>
  );
}

interface GridIconButtonProps {
  label: string;
  title?: string;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}

function GridIconButton({
  label,
  title,
  disabled,
  onClick,
  children,
}: GridIconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md bg-background/90 text-muted-foreground backdrop-blur",
        "hover:bg-background hover:text-foreground",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      {children}
    </button>
  );
}
