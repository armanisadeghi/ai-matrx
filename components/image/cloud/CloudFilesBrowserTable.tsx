"use client";

import { useCallback, useMemo, useState } from "react";
import { Slot } from "@radix-ui/react-slot";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import {
  Copy,
  Download,
  FolderInput,
  Globe,
  Loader2,
  Lock,
  MoreHorizontal,
  Share2,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { openFolderPicker } from "@/features/files/components/pickers/cloudFilesPickerOpeners";
import { FileIcon } from "@ai-matrx/media/react";
import { MediaThumbnail } from "@ai-matrx/media/react";
import {
  ShareLinkDialog,
  ShareLinkDialogBody,
} from "@/features/files/components/core/ShareLinkDialog/ShareLinkDialog";
import { useFileActions } from "@/features/files/components/core/FileActions/useFileActions";
import { useFolderActions } from "@/features/files/components/core/FileActions/useFolderActions";
import {
  useFileMutation,
  useFolderMutation,
} from "@/features/files/hooks/useFileMutation";
import { fileUrls } from "@/features/files/handler/utils/python-base";
import {
  formatFileSize,
  formatRelativeTime,
} from "@/features/files/utils/format";
import {
  isImageMime,
  isVideoMime,
  resolveMime,
} from "@/features/files/utils/file-types";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import type {
  CloudFileRecord,
  CloudFolderRecord,
  ResourceType,
  Visibility,
} from "@/features/files/types";
import {
  allCloudBrowserRowIds,
  buildCloudFilesBrowserRows,
  type CloudFilesBrowserRow,
  getCloudFileKindLabel,
  toggleCloudBrowserSelection,
} from "./cloudFilesBrowserUtils";
import { downloadUrl } from "@ai-matrx/kit/download";
import { copyNotify } from "@/lib/clipboard/copy-notify";

const MAX_PARALLEL = 4;
const CLOUD_BROWSER_LOCATION = "AI Matrx — Cloud files browser";

function cloudRowId(row: CloudFilesBrowserRow): string {
  return row.kind === "folder" ? row.folder.id : row.file.id;
}

function cloudRowName(row: CloudFilesBrowserRow): string {
  return row.kind === "folder" ? row.folder.folderName : row.file.fileName;
}

interface CloudFilesBrowserTableProps {
  folders: CloudFolderRecord[];
  files: CloudFileRecord[];
  currentUserId: string | null;
  resolvingId?: string | null;
  selectedImageIds: ReadonlySet<string>;
  disabledFileIds?: ReadonlySet<string>;
  onOpenFolder: (folderId: string) => void;
  onActivateFile: (file: CloudFileRecord) => void;
}

interface ShareTarget {
  resourceId: string;
  resourceType: "file" | "folder";
}

export function CloudFilesBrowserTable({
  folders,
  files,
  currentUserId,
  resolvingId,
  selectedImageIds,
  disabledFileIds,
  onOpenFolder,
  onActivateFile,
}: CloudFilesBrowserTableProps) {
  const fileMut = useFileMutation();
  const folderMut = useFolderMutation();
  const isMobile = useIsMobile();
  const rows = useMemo(
    () => buildCloudFilesBrowserRows({ folders, files }),
    [folders, files],
  );
  const allIds = useMemo(() => allCloudBrowserRowIds(rows), [rows]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busyKind, setBusyKind] = useState<
    "download" | "move" | "visibility" | "delete" | null
  >(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);

  const ownerLabelOf = useCallback(
    (row: CloudFilesBrowserRow) =>
      (row.kind === "folder" ? row.folder.ownerId : row.file.ownerId) ===
      currentUserId
        ? "You"
        : "—",
    [currentUserId],
  );

  const columns = useMemo<MatrxColumnDef<CloudFilesBrowserRow>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        accessorFn: cloudRowName,
        width: 280,
        cell: (row) =>
          row.kind === "folder" ? (
            <button
              type="button"
              onClick={() => onOpenFolder(row.folder.id)}
              className="flex min-w-0 items-center gap-2 text-left font-medium"
            >
              <FileIcon isFolder size={20} />
              <span className="truncate">{row.folder.folderName}</span>
            </button>
          ) : (
            <CloudFileNameButton
              file={row.file}
              disabled={disabledFileIds?.has(row.file.id) ?? false}
              resolving={resolvingId === row.file.id}
              onActivate={() => onActivateFile(row.file)}
            />
          ),
      },
      {
        id: "type",
        header: "Type",
        accessorFn: (row) =>
          row.kind === "folder" ? "Folder" : getCloudFileKindLabel(row.file),
        width: 150,
        cell: (row) =>
          row.kind === "folder" ? (
            <span className="text-muted-foreground">
              <TypeBadge label="DIR" />
              <span className="ml-2">Folder</span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              <TypeBadge label={extensionLabel(row.file.fileName)} />
              <span className="ml-2">{getCloudFileKindLabel(row.file)}</span>
            </span>
          ),
      },
      {
        id: "owner",
        header: "Owner",
        accessorFn: ownerLabelOf,
        width: 100,
        // The narrow Cloud pane fits every column to its width; these two keep
        // a readable header (the fit never goes below a column's minWidth).
        minWidth: 108,
        cell: (row) => (
          <span className="text-muted-foreground">{ownerLabelOf(row)}</span>
        ),
      },
      {
        id: "size",
        header: "Size",
        accessorFn: (row) => (row.kind === "file" ? row.file.fileSize : null),
        width: 90,
        minWidth: 90,
        cell: (row) => (
          <span className="text-muted-foreground">
            {row.kind === "file" ? formatFileSize(row.file.fileSize) : "—"}
          </span>
        ),
      },
      {
        id: "modified",
        header: "Modified",
        accessorFn: (row) =>
          row.kind === "folder" ? row.folder.updatedAt : row.file.updatedAt,
        width: 140,
        cell: (row) => (
          <span className="text-muted-foreground">
            {formatRelativeTime(
              row.kind === "folder" ? row.folder.updatedAt : row.file.updatedAt,
            )}
          </span>
        ),
      },
      {
        id: "access",
        header: "Access",
        accessorFn: (row) =>
          (row.kind === "folder" ? row.folder.visibility : row.file.visibility) ===
          "public"
            ? "Public"
            : "Only you",
        width: 110,
        cell: (row) => (
          <AccessCell
            visibility={
              row.kind === "folder" ? row.folder.visibility : row.file.visibility
            }
          />
        ),
      },
      {
        id: "row-actions",
        header: "",
        label: "Share and link",
        sortable: false,
        filter: false,
        customActions: (row) => (
          <CloudRowActions
            row={row}
            onShare={() =>
              setShareTarget({
                resourceId: cloudRowId(row),
                resourceType: row.kind,
              })
            }
          />
        ),
      },
    ],
    [
      disabledFileIds,
      onActivateFile,
      onOpenFolder,
      ownerLabelOf,
      resolvingId,
    ],
  );

  const selectedFiles = useMemo(
    () => files.filter((file) => selectedIds.includes(file.id)),
    [files, selectedIds],
  );
  const selectedFolders = useMemo(
    () => folders.filter((folder) => selectedIds.includes(folder.id)),
    [folders, selectedIds],
  );
  const allSelected =
    allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));

  const toggleAll = useCallback(() => {
    setSelectedIds(allSelected ? [] : allIds);
  }, [allIds, allSelected]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((current) => toggleCloudBrowserSelection(current, id));
  }, []);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const handleDownload = useCallback(async () => {
    if (selectedFiles.length === 0 || busyKind) return;
    setBusyKind("download");
    try {
      await runWithConcurrency(selectedFiles, MAX_PARALLEL, async (file) => {
        // Durable download URL — a pure function of the file id; the browser
        // authenticates the navigation via the file-session cookie.
        const url = file.url ?? fileUrls(file.id).download;
        downloadUrl(url, file.fileName);
      });
    } finally {
      setBusyKind(null);
    }
  }, [busyKind, fileMut, selectedFiles]);

  const handleMove = useCallback(async () => {
    if (selectedIds.length === 0 || busyKind) return;
    const target = await openFolderPicker({
      title: `Move ${selectedIds.length} ${selectedIds.length === 1 ? "item" : "items"} to folder`,
      description: "Choose a destination folder.",
    });
    if (target === undefined) return;
    setBusyKind("move");
    try {
      await runWithConcurrency(selectedFiles, MAX_PARALLEL, async (file) => {
        await fileMut.move(file.id, target);
      });
      await runWithConcurrency(
        selectedFolders,
        MAX_PARALLEL,
        async (folder) => {
          if (folder.id === target) return;
          await folderMut.move(folder.id, target);
        },
      );
      clearSelection();
    } finally {
      setBusyKind(null);
    }
  }, [
    busyKind,
    clearSelection,
    fileMut,
    folderMut,
    selectedFiles,
    selectedFolders,
    selectedIds.length,
  ]);

  const handleVisibility = useCallback(
    async (visibility: Visibility) => {
      if (selectedIds.length === 0 || busyKind) return;
      setBusyKind("visibility");
      try {
        await runWithConcurrency(selectedFiles, MAX_PARALLEL, async (file) => {
          await fileMut.setVisibility(file.id, visibility);
        });
        await runWithConcurrency(
          selectedFolders,
          MAX_PARALLEL,
          async (folder) => {
            await folderMut.setVisibility(folder.id, visibility);
          },
        );
        toast.success(`Visibility set to ${visibility}`);
      } finally {
        setBusyKind(null);
      }
    },
    [
      busyKind,
      fileMut,
      folderMut,
      selectedFiles,
      selectedFolders,
      selectedIds.length,
    ],
  );

  const handleDelete = useCallback(async () => {
    if (selectedIds.length === 0 || busyKind) return;
    setBusyKind("delete");
    try {
      await runWithConcurrency(selectedFiles, MAX_PARALLEL, async (file) => {
        await fileMut.remove(file.id);
      });
      await runWithConcurrency(
        selectedFolders,
        MAX_PARALLEL,
        async (folder) => {
          await folderMut.remove(folder.id);
        },
      );
      clearSelection();
      setConfirmDelete(false);
    } finally {
      setBusyKind(null);
    }
  }, [
    busyKind,
    clearSelection,
    fileMut,
    folderMut,
    selectedFiles,
    selectedFolders,
    selectedIds.length,
  ]);

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <div className="h-full overflow-auto">
        {isMobile ? (
          <div className="border-t border-border/70">
            <button
              type="button"
              onClick={toggleAll}
              className="flex min-h-[42px] w-full items-center justify-between border-b border-border/70 px-4 text-sm font-medium"
            >
              <span>{allSelected ? "Clear selection" : "Select all"}</span>
              <span className="text-xs text-muted-foreground">
                {rows.length} item{rows.length !== 1 ? "s" : ""}
              </span>
            </button>
            {rows.map((row) =>
              row.kind === "folder" ? (
                <MobileFolderRow
                  key={row.folder.id}
                  folder={row.folder}
                  selected={selectedIds.includes(row.folder.id)}
                  ownerLabel={
                    row.folder.ownerId === currentUserId ? "You" : "—"
                  }
                  onToggleSelected={() => toggleSelected(row.folder.id)}
                  onOpen={() => onOpenFolder(row.folder.id)}
                  onShare={() =>
                    setShareTarget({
                      resourceId: row.folder.id,
                      resourceType: "folder",
                    })
                  }
                />
              ) : (
                <MobileFileRow
                  key={row.file.id}
                  file={row.file}
                  selected={selectedIds.includes(row.file.id)}
                  imageSelected={selectedImageIds.has(`cloud:${row.file.id}`)}
                  disabled={disabledFileIds?.has(row.file.id) ?? false}
                  resolving={resolvingId === row.file.id}
                  ownerLabel={row.file.ownerId === currentUserId ? "You" : "—"}
                  onToggleSelected={() => toggleSelected(row.file.id)}
                  onActivate={() => onActivateFile(row.file)}
                  onShare={() =>
                    setShareTarget({
                      resourceId: row.file.id,
                      resourceType: "file",
                    })
                  }
                />
              ),
            )}
          </div>
        ) : (
          <MatrxDataTable<CloudFilesBrowserRow>
            tableId="cloud-files-browser"
            data={rows}
            columns={columns}
            getRowId={cloudRowId}
            searchText={(row) =>
              row.kind === "folder" ? row.folder.folderName : row.file.fileName
            }
            pageSize={0}
            fitToWidth
            selection={{
              selectedIds,
              onSelectedIdsChange: setSelectedIds,
              noun: "item",
            }}
            rowClassName={(row) =>
              row.kind === "file"
                ? cn(
                    selectedImageIds.has(`cloud:${row.file.id}`) &&
                      "border-l-2 border-l-primary bg-primary/10",
                    disabledFileIds?.has(row.file.id) && "opacity-70",
                  )
                : undefined
            }
            rowVersion={(row) =>
              row.kind === "file"
                ? [
                    selectedImageIds.has(`cloud:${row.file.id}`),
                    disabledFileIds?.has(row.file.id) ?? false,
                    resolvingId === row.file.id,
                  ]
                : undefined
            }
            rowWrapper={(row, children) => (
              <Slot
                onDoubleClick={() => {
                  if (row.kind === "folder") {
                    onOpenFolder(row.folder.id);
                    return;
                  }
                  if (
                    !disabledFileIds?.has(row.file.id) &&
                    resolvingId !== row.file.id
                  ) {
                    onActivateFile(row.file);
                  }
                }}
              >
                {children}
              </Slot>
            )}
            copy={{
              label: "Cloud file",
              listLabel: "Cloud files",
              location: CLOUD_BROWSER_LOCATION,
              rowKind: "cloud-file",
              listKind: "cloud-files",
              humanRow: (row) =>
                row.kind === "folder"
                  ? `${row.folder.folderName} — folder, ${row.folder.visibility === "public" ? "public" : "only you"}`
                  : `${row.file.fileName} — ${getCloudFileKindLabel(row.file)}, ${formatFileSize(row.file.fileSize)}, ${row.file.visibility === "public" ? "public" : "only you"}`,
            }}
          />
        )}
      </div>

      {selectedIds.length > 0 ? (
        <BulkBar
          count={selectedIds.length}
          hasFiles={selectedFiles.length > 0}
          busyKind={busyKind}
          onDownload={handleDownload}
          onMove={handleMove}
          onVisibility={handleVisibility}
          onDelete={() => setConfirmDelete(true)}
          onClear={clearSelection}
        />
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!open && !busyKind) setConfirmDelete(false);
        }}
        title="Delete selected items"
        description={`Delete ${selectedIds.length} selected ${selectedIds.length === 1 ? "item" : "items"}? This moves them to deleted files.`}
        confirmLabel="Delete"
        variant="destructive"
        busy={busyKind === "delete"}
        onConfirm={handleDelete}
      />

      {shareTarget ? (
        isMobile ? (
          <MobileShareLinkDrawer
            open={!!shareTarget}
            onOpenChange={(open) => {
              if (!open) setShareTarget(null);
            }}
            resourceId={shareTarget.resourceId}
            resourceType={shareTarget.resourceType}
          />
        ) : (
          <ShareLinkDialog
            open={!!shareTarget}
            onOpenChange={(open) => {
              if (!open) setShareTarget(null);
            }}
            resourceId={shareTarget.resourceId}
            resourceType={shareTarget.resourceType}
          />
        )
      ) : null}
    </div>
  );
}

function MobileFolderRow({
  folder,
  selected,
  ownerLabel,
  onToggleSelected,
  onOpen,
  onShare,
}: {
  folder: CloudFolderRecord;
  selected: boolean;
  ownerLabel: string;
  onToggleSelected: () => void;
  onOpen: () => void;
  onShare: () => void;
}) {
  const actions = useFolderActions(folder.id);
  return (
    <div
      className={cn(
        "border-b border-border/70 px-4 py-3",
        selected && "bg-primary/10",
      )}
    >
      <div className="flex items-center gap-3">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelected}
          aria-label={`Select ${folder.folderName}`}
        />
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <FileIcon isFolder size={22} />
          <span className="truncate text-sm font-semibold">
            {folder.folderName}
          </span>
        </button>
        <MobileRowMenu
          onShare={onShare}
          onCopyLink={async () => actions.copyShareUrl()}
        />
      </div>
      <div className="mt-1 flex items-center gap-2 pl-[3.25rem] text-xs text-muted-foreground">
        <span>Folder</span>
        <span aria-hidden>•</span>
        <span>{ownerLabel}</span>
        <span aria-hidden>•</span>
        <span>{formatRelativeTime(folder.updatedAt)}</span>
      </div>
    </div>
  );
}

function MobileFileRow({
  file,
  selected,
  imageSelected,
  disabled,
  resolving,
  ownerLabel,
  onToggleSelected,
  onActivate,
  onShare,
}: {
  file: CloudFileRecord;
  selected: boolean;
  imageSelected: boolean;
  disabled: boolean;
  resolving: boolean;
  ownerLabel: string;
  onToggleSelected: () => void;
  onActivate: () => void;
  onShare: () => void;
}) {
  const actions = useFileActions(file.id);
  const mime = resolveMime(file.mimeType, file.fileName);
  const showThumb = isImageMime(mime) || isVideoMime(mime);
  return (
    <div
      className={cn(
        "border-b border-border/70 px-4 py-3",
        selected && "bg-primary/10",
        imageSelected && "bg-primary/5",
        disabled && "opacity-70",
      )}
    >
      <div className="flex items-center gap-3">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelected}
          aria-label={`Select ${file.fileName}`}
        />
        <button
          type="button"
          disabled={disabled || resolving}
          onClick={onActivate}
          className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted/40">
            {showThumb ? (
              <MediaThumbnail
                mediaRef={{
                  file_id: file.id,
                  mime_type: file.mimeType ?? undefined,
                }}
                fileName={file.fileName}
                mimeType={file.mimeType}
                iconSize={18}
                className="h-full w-full"
              />
            ) : (
              <FileIcon fileName={file.fileName} size={18} />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {file.fileName}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <TypeBadge label={extensionLabel(file.fileName)} />
              <span>{formatFileSize(file.fileSize)}</span>
            </span>
          </span>
          {resolving ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : disabled ? (
            <Lock className="h-4 w-4 text-muted-foreground" />
          ) : null}
        </button>
        <MobileRowMenu
          onShare={onShare}
          onCopyLink={async () => actions.copyShareUrl()}
        />
      </div>
      <div className="mt-1 flex items-center gap-2 pl-[3.25rem] text-xs text-muted-foreground">
        <span>{getCloudFileKindLabel(file)}</span>
        <span aria-hidden>•</span>
        <span>{ownerLabel}</span>
        <span aria-hidden>•</span>
        <span>{formatRelativeTime(file.updatedAt)}</span>
      </div>
    </div>
  );
}

function MobileRowMenu({
  onShare,
  onCopyLink,
}: {
  onShare: () => void;
  onCopyLink: () => Promise<string | null>;
}) {
  const handleCopy = async () => {
    const url = await onCopyLink();
    if (url) copyNotify("Link copied", "success");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="More actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onShare}>
          <Share2 className="mr-2 h-3.5 w-3.5" />
          Share
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void handleCopy()}>
          <Copy className="mr-2 h-3.5 w-3.5" />
          Copy link
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CloudFileNameButton({
  file,
  disabled,
  resolving,
  onActivate,
}: {
  file: CloudFileRecord;
  disabled: boolean;
  resolving: boolean;
  onActivate: () => void;
}) {
  const mime = resolveMime(file.mimeType, file.fileName);
  const showThumb = isImageMime(mime) || isVideoMime(mime);
  return (
    <button
      type="button"
      disabled={disabled || resolving}
      onClick={onActivate}
      className="flex min-w-0 items-center gap-2 text-left font-medium disabled:cursor-not-allowed"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/40">
        {showThumb ? (
          <MediaThumbnail
            mediaRef={{
              file_id: file.id,
              mime_type: file.mimeType ?? undefined,
            }}
            fileName={file.fileName}
            mimeType={file.mimeType}
            iconSize={18}
            className="h-full w-full"
          />
        ) : (
          <FileIcon fileName={file.fileName} size={18} />
        )}
      </span>
      <span className="truncate">{file.fileName}</span>
      {resolving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
      ) : null}
      {disabled ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : null}
    </button>
  );
}

function CloudRowActions({
  row,
  onShare,
}: {
  row: CloudFilesBrowserRow;
  onShare: () => void;
}) {
  return row.kind === "folder" ? (
    <FolderRowActionButtons folderId={row.folder.id} onShare={onShare} />
  ) : (
    <FileRowActionButtons fileId={row.file.id} onShare={onShare} />
  );
}

function FileRowActionButtons({
  fileId,
  onShare,
}: {
  fileId: string;
  onShare: () => void;
}) {
  const actions = useFileActions(fileId);
  return (
    <RowActionButtons
      onShare={onShare}
      onCopyLink={async () => actions.copyShareUrl()}
    />
  );
}

function FolderRowActionButtons({
  folderId,
  onShare,
}: {
  folderId: string;
  onShare: () => void;
}) {
  const actions = useFolderActions(folderId);
  return (
    <RowActionButtons
      onShare={onShare}
      onCopyLink={async () => actions.copyShareUrl()}
    />
  );
}

function RowActionButtons({
  onShare,
  onCopyLink,
}: {
  onShare: () => void;
  onCopyLink: () => Promise<string | null>;
}) {
  const handleCopy = async () => {
    const url = await onCopyLink();
    if (url) copyNotify("Link copied", "success");
  };
  return (
    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover/matrx-row:opacity-100 focus-within:opacity-100">
      <button
        type="button"
        onClick={onShare}
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Share"
      >
        <Share2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Copy link"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        disabled
        title="Starred files are coming soon"
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground opacity-60"
        aria-label="Star"
      >
        <Star className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function BulkBar({
  count,
  hasFiles,
  busyKind,
  onDownload,
  onMove,
  onVisibility,
  onDelete,
  onClear,
}: {
  count: number;
  hasFiles: boolean;
  busyKind: string | null;
  onDownload: () => void;
  onMove: () => void;
  onVisibility: (visibility: Visibility) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2 text-sm shadow-lg backdrop-blur">
        <span className="font-semibold">{count} selected</span>
        <Divider />
        <BulkButton
          icon={<Download className="h-3.5 w-3.5" />}
          label="Download"
          disabled={!hasFiles || !!busyKind}
          busy={busyKind === "download"}
          onClick={onDownload}
        />
        <BulkButton
          icon={<FolderInput className="h-3.5 w-3.5" />}
          label="Move..."
          disabled={!!busyKind}
          busy={busyKind === "move"}
          onClick={onMove}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={!!busyKind}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
            >
              {busyKind === "visibility" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Lock className="h-3.5 w-3.5" />
              )}
              Visibility
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuItem onClick={() => onVisibility("personal")}>
              <Lock className="mr-2 h-3.5 w-3.5" />
              Private
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onVisibility("public")}>
              <Globe className="mr-2 h-3.5 w-3.5" />
              Public
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <BulkButton
          icon={<Trash2 className="h-3.5 w-3.5" />}
          label="Delete"
          disabled={!!busyKind}
          destructive
          onClick={onDelete}
        />
        <Divider />
        <BulkButton
          icon={<X className="h-3.5 w-3.5" />}
          label="Cancel"
          disabled={!!busyKind}
          onClick={onClear}
        />
      </div>
    </div>
  );
}

function BulkButton({
  icon,
  label,
  disabled,
  destructive,
  busy,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  destructive?: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50",
        destructive && "text-destructive hover:text-destructive",
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />;
}

function AccessCell({ visibility }: { visibility: Visibility }) {
  if (visibility === "public") {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Globe className="h-3.5 w-3.5" />
        Public
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Lock className="h-3.5 w-3.5" />
      Only you
    </span>
  );
}

function TypeBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded border border-info/40 bg-info/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-info-ink">
      {label}
    </span>
  );
}

function extensionLabel(fileName: string) {
  const ext = fileName.split(".").pop();
  return ext ? ext.slice(0, 4).toUpperCase() : "FILE";
}

function MobileShareLinkDrawer({
  open,
  onOpenChange,
  resourceId,
  resourceType,
  appOrigin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceId: string;
  resourceType: ResourceType;
  appOrigin?: string;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Share link</DrawerTitle>
          <DrawerDescription>
            Anyone with the link will be able to{" "}
            {resourceType === "folder" ? "view the folder" : "access this file"}
            .
          </DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-6">
          <ShareLinkDialogBody
            resourceId={resourceId}
            resourceType={resourceType}
            appOrigin={appOrigin}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  let index = 0;
  async function next() {
    const current = index;
    index += 1;
    if (current >= items.length) return;
    await worker(items[current]);
    await next();
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => next()),
  );
}
