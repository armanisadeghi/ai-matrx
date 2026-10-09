/**
 * features/files/components/surfaces/desktop/FileTableRow.tsx
 *
 * The file table's row pieces. The table itself is the shared `MatrxDataTable`
 * (FileTable.tsx); this module supplies what only Files knows:
 *
 *   - `FileTableRowShell` — the table's `rowWrapper`. It owns the whole `<tr>`:
 *     drag (files and folders), drop (folders), the right-click menu, the
 *     surface-value attributes agent context reads, and scroll-into-view when the
 *     row is focused programmatically (a just-uploaded file). It renders the
 *     package's `<tr>` cloned with those props (never a wrapper element).
 *   - the cell bodies, one per `ColumnId`, for files and folders.
 *
 * Activation contract — Dropbox-web style: a single click anywhere on the row
 * activates (the table's `onRowOpen`); the table ignores clicks from portalled
 * menus and from interactive descendants, so the inline actions never activate
 * the row. dnd-kit's PointerSensor distance:6 keeps a click a click.
 *
 * Folders degrade to an em-dash in file-only columns (Extension, MIME, Size,
 * Version, Knowledge, Context) so the row stays aligned.
 *
 * THE DOOR LAW (common-docs/policies/no-dead-ends.md): the file name is an
 * `EntityRef` (plain click previews in place, modified clicks open
 * `/files/f/<id>`); real, live rows carry `EntityDoorControls`. Peek is off: the
 * row click already opens the full preview pane.
 */

"use client";

import React, { useEffect, useRef } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Copy, MoreHorizontal, Share2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectFocusedId } from "@/features/files/redux/selectors";
import type {
  CloudFileRecord,
  CloudFolderRecord,
  ColumnId,
} from "@/features/files/types";
import {
  formatFileSize,
  formatRelativeTime,
} from "@/features/files/utils/format";
import { buildFilesAllFolderUrl } from "@/features/files/utils/url-state";
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";
import { FileIcon } from "@ai-matrx/media/react";
import { FileRagBadge } from "@/features/files/components/core/FileBadges/FileRagBadge";
import { FileContextMenu } from "@/features/files/components/core/FileContextMenu/FileContextMenu";
import { FolderContextMenu } from "@/features/files/components/core/FolderContextMenu/FolderContextMenu";
import {
  FileRowContextMenu,
  FolderRowContextMenu,
} from "@/features/files/components/core/RowContextMenu/RowContextMenu";
import { useFileActions } from "@/features/files/components/core/FileActions/useFileActions";
import { useFolderActions } from "@/features/files/components/core/FileActions/useFolderActions";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { FolderIconWithMembers } from "./FolderIconWithMembers";
import { AccessCell } from "./AccessCell";
import { FileTypeBadge } from "./FileTypeBadge";
import { OwnerCell } from "./OwnerCell";
import { RagStatusCell } from "./RagStatusCell";
import { FileContextCell } from "./FileContextCell";
import type { RowItem } from "./row-data";

/** One table row: the built record plus the sharing facts its cells show. */
export interface FileListRow {
  id: string;
  item: RowItem;
  isShared: boolean;
  memberCount: number;
  granteeIds: string[];
  /** Search mode only: the folder this result lives in. */
  parentPath: string | null;
}

/** Row commands the cells call; one stable object for every row. */
export interface FileTableRowCommands {
  activate: (id: string) => void;
  openShare: (id: string, kind: "file" | "folder") => void;
}

// ── Row shell (rowWrapper) ─────────────────────────────────────────────────

type TrProps = React.ComponentPropsWithRef<"tr"> & Record<`data-${string}`, string | undefined>;

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>): React.RefCallback<T> {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.RefObject<T | null>).current = node;
    }
  };
}

export function FileTableRowShell({
  row,
  children,
}: {
  row: FileListRow;
  children: React.ReactNode;
}) {
  const isFolder = row.item.kind === "folder";
  const isFocused = useAppSelector(selectFocusedId) === row.id;
  const rowRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (isFocused) {
      rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [isFocused]);

  // Files and folders are draggable (drop onto a folder row or the tree to
  // move); folders are also drop targets.
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } =
    useDraggable({
      id: isFolder ? `folder-drag-${row.id}` : `file-${row.id}`,
      data: { type: isFolder ? "folder" : "file", id: row.id },
    });
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `folder-${row.id}`,
    data: { type: "folder", id: row.id },
    disabled: !isFolder,
  });
  const setRef = (node: HTMLTableRowElement | null) => {
    rowRef.current = node;
    setDragRef(node);
    if (isFolder) setDropRef(node);
  };

  // The table's own `<tr>` gets the drag props, the surface attributes and the
  // ref by cloning, so the row menu below slots straight onto an intrinsic
  // `<tr>` (a component child would make the menu wrap the row in a <div>).
  if (!React.isValidElement<TrProps>(children)) return <>{children}</>;
  const own = children.props;
  const handlers: Record<string, unknown> = {};
  for (const [name, handler] of Object.entries(listeners ?? {})) {
    const theirs = own[name as keyof TrProps];
    handlers[name] = (event: React.SyntheticEvent) => {
      if (typeof theirs === "function") (theirs as (e: React.SyntheticEvent) => void)(event);
      (handler as (e: React.SyntheticEvent) => void)(event);
    };
  }
  const tr = React.cloneElement(children, {
    ...attributes,
    ...handlers,
    ref: mergeRefs(own.ref, setRef),
    "data-surface-value": isFolder ? "visible_folders" : "visible_files",
    "data-surface-record-id": row.id,
    className: cn(
      own.className,
      "group/entity-ref",
      isFocused && "ring-1 ring-inset ring-primary/40",
      isFolder && isOver && "ring-1 ring-inset ring-primary",
      isDragging && "opacity-50",
    ),
  } as TrProps);

  return isFolder ? (
    <FolderRowContextMenu folderId={row.id}>{tr}</FolderRowContextMenu>
  ) : (
    <FileRowContextMenu fileId={row.id}>{tr}</FileRowContextMenu>
  );
}

// ── Cells ──────────────────────────────────────────────────────────────────

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  if (i <= 0 || i === filename.length - 1) return "";
  return filename.slice(i + 1).toLowerCase();
}

const DASH = <span className="text-xs text-muted-foreground/60">—</span>;

export function FileTableCell({
  id,
  row,
  currentUserId,
  commands,
}: {
  id: ColumnId;
  row: FileListRow;
  currentUserId: string | null;
  commands: FileTableRowCommands;
}) {
  if (row.item.kind === "folder") {
    return (
      <FolderCell
        id={id}
        row={row}
        folder={row.item.folder}
        currentUserId={currentUserId}
        commands={commands}
      />
    );
  }
  return (
    <FileCell
      id={id}
      row={row}
      file={row.item.file}
      currentUserId={currentUserId}
      commands={commands}
    />
  );
}

function FileCell({
  id,
  row,
  file,
  currentUserId,
  commands,
}: {
  id: ColumnId;
  row: FileListRow;
  file: CloudFileRecord;
  currentUserId: string | null;
  commands: FileTableRowCommands;
}) {
  switch (id) {
    case "name":
      return (
        <div className="max-lg:w-[calc(100vw-16rem)] max-lg:max-w-[calc(100vw-16rem)]">
          <div className="flex items-center gap-2 min-w-0">
            <FileIcon
              fileName={file.fileName}
              mimeType={file.mimeType}
              size={20}
            />
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <span className="flex min-w-0 items-center gap-1">
                {/* Plain click previews in place (`onOpen`); modified clicks
                    open `/files/f/{id}` natively — the name is a real anchor. */}
                <EntityRef
                  token="file"
                  id={file.id}
                  name={file.fileName}
                  showIcon={false}
                  onOpen={() => commands.activate(file.id)}
                  className="min-w-0 font-medium text-foreground"
                />
                <FileRagBadge fileId={file.id} className="shrink-0" />
                {/* Two questions: has a files.files id at all (adapter rows do
                    not), and is that record still live (a trashed row's door
                    would 404). */}
                {file.source.kind === "real" && !file.deletedAt && (
                  <EntityDoorControls
                    token="file"
                    id={file.id}
                    name={file.fileName}
                    showOpen
                    disablePeek
                  />
                )}
              </span>
              {row.parentPath ? (
                <span
                  className="truncate text-[11px] text-muted-foreground leading-tight"
                  title={`In ${row.parentPath}`}
                >
                  in {row.parentPath}
                </span>
              ) : null}
            </div>
            <FileRowActions
              fileId={file.id}
              onShare={() => commands.openShare(file.id, "file")}
            />
          </div>
        </div>
      );
    case "type":
      return <FileTypeBadge fileName={file.fileName} mimeType={file.mimeType} />;
    case "extension": {
      const ext = extOf(file.fileName);
      return ext ? (
        <span className="rounded-sm border border-border bg-muted/40 px-1.5 py-px text-[10px] font-semibold tracking-wide text-muted-foreground">
          {ext.toUpperCase()}
        </span>
      ) : (
        DASH
      );
    }
    case "mime":
      return (
        <span
          className="block truncate text-xs text-muted-foreground"
          title={file.mimeType ?? undefined}
        >
          {file.mimeType ?? "—"}
        </span>
      );
    case "path":
      return (
        <span
          className="block truncate text-xs text-muted-foreground"
          title={file.filePath}
        >
          {file.filePath}
        </span>
      );
    case "owner":
      return <OwnerCell ownerId={file.ownerId} currentUserId={currentUserId} />;
    case "size":
      return (
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatFileSize(file.fileSize)}
        </span>
      );
    case "version":
      return (
        <span className="text-xs text-muted-foreground tabular-nums">
          v{file.currentVersion}
        </span>
      );
    case "updated_at":
      return (
        <span className="text-xs text-muted-foreground">
          {formatRelativeTime(file.updatedAt)}
        </span>
      );
    case "created_at":
      return (
        <span className="text-xs text-muted-foreground">
          {formatRelativeTime(file.createdAt)}
        </span>
      );
    case "access":
      return (
        <AccessCell
          entityType="file"
          entityId={file.id}
          visibility={file.visibility}
          memberCount={row.memberCount}
          isShared={row.isShared}
          granteeIds={row.granteeIds}
        />
      );
    case "rag_status":
      return <RagStatusCell fileId={file.id} />;
    case "context":
      return <FileContextCell fileId={file.id} fileName={file.fileName} />;
  }
}

function FolderCell({
  id,
  row,
  folder,
  currentUserId,
  commands,
}: {
  id: ColumnId;
  row: FileListRow;
  folder: CloudFolderRecord;
  currentUserId: string | null;
  commands: FileTableRowCommands;
}) {
  switch (id) {
    case "name":
      return (
        <div className="max-lg:w-[calc(100vw-16rem)] max-lg:max-w-[calc(100vw-16rem)]">
          <div className="flex items-center gap-2 min-w-0">
            <FolderIconWithMembers isShared={row.isShared} size={18} />
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  commands.activate(folder.id);
                }}
                className="truncate text-left font-medium text-foreground"
              >
                {folder.folderName}
              </button>
              {row.parentPath ? (
                <span
                  className="truncate text-[11px] text-muted-foreground leading-tight"
                  title={`In ${row.parentPath}`}
                >
                  in {row.parentPath}
                </span>
              ) : null}
            </div>
            {/* Has an id, and is still live: a deleted folder's path resolves
                to nothing. Folders are addressed by PATH (no registry hrefFor). */}
            {folder.source.kind === "real" && !folder.deletedAt && (
              <EntityDoorControls
                token="folder"
                id={folder.id}
                name={folder.folderName}
                href={buildFilesAllFolderUrl(folder.folderPath, "")}
                showOpen
                disablePeek
              />
            )}
            <FolderRowActions
              folderId={folder.id}
              onShare={() => commands.openShare(folder.id, "folder")}
            />
          </div>
        </div>
      );
    case "type":
      return <FileTypeBadge fileName={folder.folderName} isFolder />;
    case "extension":
    case "mime":
    case "size":
    case "version":
    case "rag_status":
    case "context":
      return DASH;
    case "path":
      return (
        <span
          className="block truncate text-xs text-muted-foreground"
          title={folder.folderPath}
        >
          {folder.folderPath}
        </span>
      );
    case "owner":
      return <OwnerCell ownerId={folder.ownerId} currentUserId={currentUserId} />;
    case "updated_at":
      return (
        <span className="text-xs text-muted-foreground">
          {formatRelativeTime(folder.updatedAt)}
        </span>
      );
    case "created_at":
      return (
        <span className="text-xs text-muted-foreground">
          {formatRelativeTime(folder.createdAt)}
        </span>
      );
    case "access":
      return (
        <AccessCell
          entityType="folder"
          entityId={folder.id}
          visibility={folder.visibility}
          memberCount={row.memberCount}
          isShared={row.isShared}
          granteeIds={row.granteeIds}
        />
      );
  }
}

// ── Hover actions ──────────────────────────────────────────────────────────

// Revealed by hovering the row (the table's `group/matrx-row`). Desktop hides
// them until then; tablet has no dependable hover, so its 44px More action
// stays visible beside the name while the secondary actions stay desktop-only.
const ROW_ACTIONS_CLASS = cn(
  "flex shrink-0 items-center gap-1 pr-1 transition-opacity lg:ml-auto",
  "lg:opacity-0 lg:group-hover/matrx-row:opacity-100 lg:focus-within:opacity-100",
  // pointer-events off while hidden (D72): invisible buttons never swallow a
  // click meant for the row, and hit areas never move mid-click.
  "lg:pointer-events-none lg:group-hover/matrx-row:pointer-events-auto lg:focus-within:pointer-events-auto",
);

function FileRowActions({
  fileId,
  onShare,
}: {
  fileId: string;
  onShare: () => void;
}) {
  const actions = useFileActions(fileId);
  return (
    <div data-row-actions="" className={ROW_ACTIONS_CLASS}>
      <ShareButton onShare={onShare} />
      <IconButton
        label="Copy link"
        className="hidden lg:flex"
        onClick={(e) => {
          e.stopPropagation();
          void actions.copyShareUrl();
        }}
      >
        <Copy className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton label="Star" title="Coming soon" className="hidden lg:flex" disabled>
        <Star className="h-3.5 w-3.5" />
      </IconButton>
      <FileContextMenu fileId={fileId}>
        <IconButton
          label="More"
          className="h-11 w-11 lg:h-7 lg:w-7"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </IconButton>
      </FileContextMenu>
    </div>
  );
}

function FolderRowActions({
  folderId,
  onShare,
}: {
  folderId: string;
  onShare: () => void;
}) {
  const folderActions = useFolderActions(folderId);
  return (
    <div data-row-actions="" className={ROW_ACTIONS_CLASS}>
      <ShareButton onShare={onShare} />
      <IconButton
        label="Copy link"
        className="hidden lg:flex"
        onClick={(e) => {
          e.stopPropagation();
          void folderActions.copyShareUrl();
        }}
      >
        <Copy className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton label="Star" title="Coming soon" className="hidden lg:flex" disabled>
        <Star className="h-3.5 w-3.5" />
      </IconButton>
      <FolderContextMenu folderId={folderId}>
        <IconButton
          label="More"
          className="h-11 w-11 lg:h-7 lg:w-7"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </IconButton>
      </FolderContextMenu>
    </div>
  );
}

function ShareButton({ onShare }: { onShare: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onShare();
      }}
      className="hidden items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90 lg:inline-flex"
    >
      <Share2 className="h-3 w-3" aria-hidden="true" />
      Share
    </button>
  );
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: React.ReactNode;
}

/**
 * forwardRef + spread {...rest} is mandatory for `<DropdownMenuTrigger asChild>`:
 * without the ref Radix cannot anchor the menu, without the spread its injected
 * `onClick`/`aria-*`/`data-state` props are dropped.
 */
const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ label, title, disabled, className, children, ...rest }, ref) {
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
          disabled && "opacity-40",
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
