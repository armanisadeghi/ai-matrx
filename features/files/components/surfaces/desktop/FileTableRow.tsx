/**
 * features/files/components/surfaces/desktop/FileTableRow.tsx
 *
 * One row inside the file table. Cells are rendered based on the
 * `visibleColumnIds` array passed from the parent — Box.com-/Drive-style
 * configurable columns. On hover, a row reveals the inline action toolbar
 * (Share / Copy link / Star / More).
 *
 * Activation contract — Dropbox-web style:
 *   - Single-click ANYWHERE on the row activates: files open the
 *     preview, folders navigate into. The row carries `cursor-pointer`
 *     so the affordance is obvious.
 *   - Inline action buttons (checkbox, Share, Copy link, More, name
 *     button for keyboard) MUST `e.stopPropagation()` on click so they
 *     don't accidentally trigger row activation.
 *   - dnd-kit's PointerSensor distance:6 ensures a press-and-hold-drag
 *     past 6px is a drag (no click fires) while a release within 6px
 *     fires the click as expected.
 *
 * Folders gracefully degrade to em-dash for file-only columns
 * (Extension, MIME, Size, Version) so the row stays aligned with no
 * empty gaps.
 */

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Copy, MoreHorizontal, Share2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  CloudFileRecord,
  CloudFolderRecord,
  ColumnId,
} from "@/features/files/types";
import {
  formatFileSize,
  formatRelativeTime,
} from "@/features/files/utils/format";
import { FileIcon } from "@/features/files/components/core/FileIcon/FileIcon";
import { FileRagBadge } from "@/features/files/components/core/FileBadges/FileRagBadge";
import { FileContextMenu } from "@/features/files/components/core/FileContextMenu/FileContextMenu";
import { FolderContextMenu } from "@/features/files/components/core/FolderContextMenu/FolderContextMenu";
import {
  FileRowContextMenu,
  FolderRowContextMenu,
} from "@/features/files/components/core/RowContextMenu/RowContextMenu";
import { useFileActions } from "@/features/files/components/core/FileActions/useFileActions";
import { useFolderActions } from "@/features/files/components/core/FileActions/useFolderActions";
import { FolderIconWithMembers } from "./FolderIconWithMembers";
import { AccessBadge } from "./AccessBadge";
import { SharedAvatarStack } from "./SharedAvatarStack";
import { FileTypeBadge } from "./FileTypeBadge";
import { OwnerCell } from "./OwnerCell";
import { RagStatusCell } from "./RagStatusCell";
import { FileContextCell } from "./FileContextCell";

export interface FileTableRowProps {
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
  /** Ordered list of columns to render after the leading checkbox cell. */
  visibleColumnIds: ReadonlyArray<ColumnId>;
  /** Authenticated user id — drives the "You" label in the Owner cell. */
  currentUserId?: string | null;
  onToggleSelected: () => void;
  onActivate: () => void;
  onOpenShare: () => void;
  isShared: boolean;
  memberCount: number;
  granteeIds: string[];
  /** When set (search mode only), shown as a small breadcrumb under the
   * file/folder name so the user knows which folder this result lives in. */
  parentPath?: string | null;
}

export function FileTableRow(props: FileTableRowProps) {
  if (props.kind === "file" && props.file) {
    return <FileRow {...props} file={props.file} />;
  }
  if (props.kind === "folder" && props.folder) {
    return <FolderRow {...props} folder={props.folder} />;
  }
  return null;
}

// Trailing cell for the Column-Settings gear column. Empty in body rows so
// the gear stays anchored to the header. Width matches the header's gear
// cell so the table grid stays aligned.
function GearTrailingCell() {
  return <td className="w-10 px-1 py-2" aria-hidden="true" />;
}

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  if (i <= 0 || i === filename.length - 1) return "";
  return filename.slice(i + 1).toLowerCase();
}

interface FileRowProps extends FileTableRowProps {
  file: CloudFileRecord;
}

function FileRow({
  file,
  selected,
  isPreviewActive,
  isFocused,
  visibleColumnIds,
  currentUserId,
  onToggleSelected,
  onActivate,
  onOpenShare,
  isShared,
  memberCount,
  granteeIds,
  parentPath,
}: FileRowProps) {
  const [hovered, setHovered] = useState(false);
  const actions = useFileActions(file.id);
  const rowRef = useRef<HTMLTableRowElement>(null);

  const handleCopyLink = useCallback(() => {
    void actions.copyShareUrl();
  }, [actions]);

  useEffect(() => {
    if (isFocused) {
      rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [isFocused]);

  // Files are draggable — they can be dropped onto folder rows to move.
  // The drag handle covers the whole row, but the activation distance on
  // the parent DndContext PointerSensor (6px) preserves single-click
  // selection.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `file-${file.id}`,
    data: { type: "file", id: file.id },
  });

  const mergeRef = (node: HTMLTableRowElement | null) => {
    (rowRef as React.MutableRefObject<HTMLTableRowElement | null>).current =
      node;
    setNodeRef(node);
  };

  return (
    <FileRowContextMenu fileId={file.id}>
      <tr
        ref={mergeRef}
        className={cn(
          "group cursor-pointer border-b text-sm transition-colors",
          isPreviewActive
            ? "bg-primary/10 border-l-2 border-l-primary"
            : isFocused
              ? "bg-primary/15 ring-1 ring-inset ring-primary/40"
              : selected
                ? "bg-accent/70"
                : "hover:bg-accent/40",
          isDragging && "opacity-50",
        )}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={onActivate}
        {...attributes}
        {...listeners}
      >
        <td className="w-6 px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelected}
            aria-label={`Select ${file.fileName}`}
          />
        </td>
        {visibleColumnIds.map((id) => (
          <FileCell
            key={id}
            id={id}
            file={file}
            currentUserId={currentUserId}
            isShared={isShared}
            memberCount={memberCount}
            granteeIds={granteeIds}
            hovered={hovered}
            onActivate={onActivate}
            onShare={onOpenShare}
            onCopyLink={handleCopyLink}
            parentPath={parentPath ?? null}
          />
        ))}
        <GearTrailingCell />
      </tr>
    </FileRowContextMenu>
  );
}

interface FileCellProps {
  id: ColumnId;
  file: CloudFileRecord;
  currentUserId?: string | null;
  isShared: boolean;
  memberCount: number;
  granteeIds: string[];
  hovered: boolean;
  onActivate: () => void;
  onShare: () => void;
  onCopyLink: () => void;
  parentPath: string | null;
}

function FileCell({
  id,
  file,
  currentUserId,
  isShared,
  memberCount,
  granteeIds,
  hovered,
  onActivate,
  onShare,
  onCopyLink,
  parentPath,
}: FileCellProps) {
  switch (id) {
    case "name":
      return (
        <td className="px-2 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileIcon fileName={file.fileName} size={20} />
            <div className="flex min-w-0 flex-col">
              <span className="flex min-w-0 items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onActivate();
                  }}
                  className="truncate text-left font-medium text-foreground hover:underline"
                >
                  {file.fileName}
                </button>
                <FileRagBadge fileId={file.id} className="shrink-0" />
              </span>
              {parentPath ? (
                <span
                  className="truncate text-[11px] text-muted-foreground leading-tight"
                  title={`In ${parentPath}`}
                >
                  in {parentPath}
                </span>
              ) : null}
            </div>
            <RowActions
              visible={hovered}
              onShare={onShare}
              onCopyLink={onCopyLink}
              fileId={file.id}
            />
          </div>
        </td>
      );
    case "type":
      return (
        <td className="px-4 py-2 whitespace-nowrap">
          <FileTypeBadge fileName={file.fileName} />
        </td>
      );
    case "extension":
      return (
        <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
          {extOf(file.fileName) ? (
            <span className="rounded-sm border border-border bg-muted/40 px-1.5 py-px text-[10px] font-semibold tracking-wide">
              {extOf(file.fileName).toUpperCase()}
            </span>
          ) : (
            <span className="text-muted-foreground/60">—</span>
          )}
        </td>
      );
    case "mime":
      return (
        <td
          className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap"
          title={file.mimeType ?? undefined}
        >
          <span className="truncate inline-block max-w-[14rem] align-middle">
            {file.mimeType ?? "—"}
          </span>
        </td>
      );
    case "path":
      return (
        <td
          className="px-4 py-2 text-xs text-muted-foreground"
          title={file.filePath}
        >
          <span className="block truncate max-w-[18rem]">{file.filePath}</span>
        </td>
      );
    case "owner":
      return (
        <td className="px-4 py-2 whitespace-nowrap">
          <OwnerCell
            ownerId={file.ownerId}
            currentUserId={currentUserId ?? null}
          />
        </td>
      );
    case "size":
      return (
        <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap tabular-nums">
          {formatFileSize(file.fileSize)}
        </td>
      );
    case "version":
      return (
        <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap tabular-nums">
          v{file.currentVersion}
        </td>
      );
    case "updated_at":
      return (
        <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
          {formatRelativeTime(file.updatedAt)}
        </td>
      );
    case "created_at":
      return (
        <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
          {formatRelativeTime(file.createdAt)}
        </td>
      );
    case "access":
      return (
        <td className="px-4 py-2 whitespace-nowrap">
          <div className="flex items-center gap-2">
            {isShared && granteeIds.length > 0 ? (
              <SharedAvatarStack granteeIds={granteeIds} max={2} size="sm" />
            ) : null}
            <AccessBadge
              visibility={file.visibility}
              memberCount={memberCount}
            />
          </div>
        </td>
      );
    case "rag_status":
      return (
        <td className="px-4 py-2 whitespace-nowrap">
          <RagStatusCell fileId={file.id} />
        </td>
      );
    case "context":
      return (
        <td className="px-4 py-2 whitespace-nowrap">
          <FileContextCell fileId={file.id} fileName={file.fileName} />
        </td>
      );
  }
}

interface FolderRowProps extends FileTableRowProps {
  folder: CloudFolderRecord;
}

function FolderRow({
  folder,
  selected,
  isFocused,
  visibleColumnIds,
  currentUserId,
  onToggleSelected,
  onActivate,
  isShared,
  memberCount,
  granteeIds,
  onOpenShare,
  parentPath,
}: FolderRowProps) {
  const [hovered, setHovered] = useState(false);
  const rowRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (isFocused) {
      rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [isFocused]);

  // Folders are both drop targets AND draggable. Drop: another file or
  // folder lands here and we move it under this folder. Drag: this folder
  // can be dropped onto another folder (or the tree sidebar) to be moved.
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `folder-${folder.id}`,
    data: { type: "folder", id: folder.id },
  });
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `folder-drag-${folder.id}`,
    data: { type: "folder", id: folder.id },
  });
  const setMergedRef = (node: HTMLTableRowElement | null) => {
    (rowRef as React.MutableRefObject<HTMLTableRowElement | null>).current =
      node;
    setDropRef(node);
    setDragRef(node);
  };

  return (
    <FolderRowContextMenu folderId={folder.id}>
      <tr
        ref={setMergedRef}
        className={cn(
          "group cursor-pointer border-b text-sm transition-colors",
          isFocused
            ? "bg-primary/15 ring-1 ring-inset ring-primary/40"
            : selected
              ? "bg-accent/70"
              : "hover:bg-accent/40",
          isOver && "bg-primary/10 ring-1 ring-inset ring-primary",
          isDragging && "opacity-50",
        )}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={onActivate}
        {...attributes}
        {...listeners}
      >
        <td className="w-8 px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelected}
            aria-label={`Select ${folder.folderName}`}
          />
        </td>
        {visibleColumnIds.map((id) => (
          <FolderCell
            key={id}
            id={id}
            folder={folder}
            currentUserId={currentUserId}
            isShared={isShared}
            memberCount={memberCount}
            granteeIds={granteeIds}
            hovered={hovered}
            onActivate={onActivate}
            onShare={onOpenShare}
            parentPath={parentPath ?? null}
          />
        ))}
        <GearTrailingCell />
      </tr>
    </FolderRowContextMenu>
  );
}

interface FolderCellProps {
  id: ColumnId;
  folder: CloudFolderRecord;
  currentUserId?: string | null;
  isShared: boolean;
  memberCount: number;
  granteeIds: string[];
  hovered: boolean;
  onActivate: () => void;
  onShare: () => void;
  parentPath: string | null;
}

function FolderCell({
  id,
  folder,
  currentUserId,
  isShared,
  memberCount,
  granteeIds,
  hovered,
  onActivate,
  onShare,
  parentPath,
}: FolderCellProps) {
  switch (id) {
    case "name":
      return (
        <td className="px-2 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <FolderIconWithMembers isShared={isShared} size={18} />
            <div className="flex min-w-0 flex-col">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onActivate();
                }}
                className="truncate text-left font-medium text-foreground hover:underline"
              >
                {folder.folderName}
              </button>
              {parentPath ? (
                <span
                  className="truncate text-[11px] text-muted-foreground leading-tight"
                  title={`In ${parentPath}`}
                >
                  in {parentPath}
                </span>
              ) : null}
            </div>
            <FolderRowActions
              visible={hovered}
              onShare={onShare}
              folderId={folder.id}
            />
          </div>
        </td>
      );
    case "type":
      return (
        <td className="px-4 py-2 whitespace-nowrap">
          <FileTypeBadge fileName={folder.folderName} isFolder />
        </td>
      );
    case "extension":
    case "mime":
    case "size":
    case "version":
    case "rag_status":
    case "context":
      return (
        <td className="px-4 py-2 text-xs text-muted-foreground/60 whitespace-nowrap">
          —
        </td>
      );
    case "path":
      return (
        <td
          className="px-4 py-2 text-xs text-muted-foreground"
          title={folder.folderPath}
        >
          <span className="block truncate max-w-[18rem]">
            {folder.folderPath}
          </span>
        </td>
      );
    case "owner":
      return (
        <td className="px-4 py-2 whitespace-nowrap">
          <OwnerCell
            ownerId={folder.ownerId}
            currentUserId={currentUserId ?? null}
          />
        </td>
      );
    case "updated_at":
      return (
        <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
          {formatRelativeTime(folder.updatedAt)}
        </td>
      );
    case "created_at":
      return (
        <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
          {formatRelativeTime(folder.createdAt)}
        </td>
      );
    case "access":
      return (
        <td className="px-4 py-2 whitespace-nowrap">
          <div className="flex items-center gap-2">
            {isShared && granteeIds.length > 0 ? (
              <SharedAvatarStack granteeIds={granteeIds} max={2} size="sm" />
            ) : null}
            <AccessBadge
              visibility={folder.visibility}
              memberCount={memberCount}
            />
          </div>
        </td>
      );
  }
}

interface RowActionsProps {
  visible: boolean;
  onShare: () => void;
  onCopyLink: () => void;
  fileId: string;
}

function RowActions({ visible, onShare, onCopyLink, fileId }: RowActionsProps) {
  return (
    <div
      className={cn(
        "ml-auto flex items-center gap-1 pr-1 transition-opacity",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onShare();
        }}
        className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 shadow-sm"
      >
        <Share2 className="h-3 w-3" aria-hidden="true" />
        Share
      </button>
      <IconButton
        label="Copy link"
        onClick={(e) => {
          e.stopPropagation();
          onCopyLink();
        }}
      >
        <Copy className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton label="Star" title="Coming soon" disabled>
        <Star className="h-3.5 w-3.5" />
      </IconButton>
      <FileContextMenu fileId={fileId}>
        <IconButton
          label="More"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </IconButton>
      </FileContextMenu>
    </div>
  );
}

interface FolderRowActionsProps {
  visible: boolean;
  onShare: () => void;
  folderId: string;
}

function FolderRowActions({
  visible,
  onShare,
  folderId,
}: FolderRowActionsProps) {
  const folderActions = useFolderActions(folderId);
  return (
    <div
      className={cn(
        "ml-auto flex items-center gap-1 pr-1 transition-opacity",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onShare();
        }}
        className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 shadow-sm"
      >
        <Share2 className="h-3 w-3" aria-hidden="true" />
        Share
      </button>
      <IconButton
        label="Copy link"
        onClick={(e) => {
          e.stopPropagation();
          void folderActions.copyShareUrl();
        }}
      >
        <Copy className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton label="Star" title="Coming soon" disabled>
        <Star className="h-3.5 w-3.5" />
      </IconButton>
      <FolderContextMenu folderId={folderId}>
        <IconButton
          label="More"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </IconButton>
      </FolderContextMenu>
    </div>
  );
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: React.ReactNode;
}

/**
 * forwardRef + spread {...rest} is mandatory for use with Radix's
 * `<DropdownMenuTrigger asChild>`. Without ref forwarding Radix can't anchor
 * the menu and click-to-open silently fails on some renders. Without prop
 * spread, Radix's injected `onClick`/`aria-*`/`data-state` props get dropped.
 */
const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { label, title, disabled, className, children, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={title ?? label}
        disabled={disabled}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground",
          "hover:bg-accent hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          disabled && "pointer-events-none opacity-40",
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
