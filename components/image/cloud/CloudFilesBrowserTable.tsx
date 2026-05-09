"use client";

import { useCallback, useMemo, useState } from "react";
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
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  deleteFile as deleteFileThunk,
  deleteFolder as deleteFolderThunk,
  getSignedUrl as getSignedUrlThunk,
  moveFile as moveFileThunk,
  updateFileMetadata,
  updateFolder as updateFolderThunk,
} from "@/features/files/redux/thunks";
import { openFolderPicker } from "@/features/files/components/pickers/CloudFilesPickerHost";
import { FileIcon } from "@/features/files/components/core/FileIcon/FileIcon";
import { MediaThumbnail } from "@/features/files/components/core/MediaThumbnail/MediaThumbnail";
import { ShareLinkDialog } from "@/features/files/components/core/ShareLinkDialog/ShareLinkDialog";
import { useFileActions } from "@/features/files/components/core/FileActions/useFileActions";
import { useFolderActions } from "@/features/files/components/core/FileActions/useFolderActions";
import { formatFileSize, formatRelativeTime } from "@/features/files/utils/format";
import { isImageMime, isVideoMime, resolveMime } from "@/features/files/utils/file-types";
import { useIsMobile } from "@/hooks/use-mobile";
import type {
  CloudFileRecord,
  CloudFolderRecord,
  Visibility,
} from "@/features/files/types";
import {
  allCloudBrowserRowIds,
  buildCloudFilesBrowserRows,
  getCloudFileKindLabel,
  toggleCloudBrowserSelection,
} from "./cloudFilesBrowserUtils";

const MAX_PARALLEL = 4;

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
  const dispatch = useAppDispatch();
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
        const result = await dispatch(
          getSignedUrlThunk({ fileId: file.id, expiresIn: 3600 }),
        );
        const url = (result as { payload?: { url?: string } } | undefined)
          ?.payload?.url;
        if (!url) return;
        const a = document.createElement("a");
        a.href = url;
        a.rel = "noopener noreferrer";
        a.download = file.fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
    } finally {
      setBusyKind(null);
    }
  }, [busyKind, dispatch, selectedFiles]);

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
        await dispatch(
          moveFileThunk({ fileId: file.id, newParentFolderId: target }),
        ).unwrap();
      });
      await runWithConcurrency(selectedFolders, MAX_PARALLEL, async (folder) => {
        if (folder.id === target) return;
        await dispatch(
          updateFolderThunk({ folderId: folder.id, patch: { parentId: target } }),
        ).unwrap();
      });
      clearSelection();
    } finally {
      setBusyKind(null);
    }
  }, [
    busyKind,
    clearSelection,
    dispatch,
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
          await dispatch(
            updateFileMetadata({ fileId: file.id, patch: { visibility } }),
          ).unwrap();
        });
        await runWithConcurrency(selectedFolders, MAX_PARALLEL, async (folder) => {
          await dispatch(
            updateFolderThunk({ folderId: folder.id, patch: { visibility } }),
          ).unwrap();
        });
        toast.success(`Visibility set to ${visibility}`);
      } finally {
        setBusyKind(null);
      }
    },
    [busyKind, dispatch, selectedFiles, selectedFolders, selectedIds.length],
  );

  const handleDelete = useCallback(async () => {
    if (selectedIds.length === 0 || busyKind) return;
    setBusyKind("delete");
    try {
      await runWithConcurrency(selectedFiles, MAX_PARALLEL, async (file) => {
        await dispatch(deleteFileThunk({ fileId: file.id })).unwrap();
      });
      await runWithConcurrency(selectedFolders, MAX_PARALLEL, async (folder) => {
        await dispatch(deleteFolderThunk({ folderId: folder.id })).unwrap();
      });
      clearSelection();
      setConfirmDelete(false);
    } finally {
      setBusyKind(null);
    }
  }, [
    busyKind,
    clearSelection,
    dispatch,
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
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b text-xs text-muted-foreground">
                <th className="w-8 px-3 py-2 text-left">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
                <HeaderCell label="Name" className="min-w-[320px]" />
                <HeaderCell label="Type" className="w-[180px]" />
                <HeaderCell label="Owner" className="w-[140px]" />
                <HeaderCell label="Size" className="w-[120px]" />
                <HeaderCell label="Modified" className="w-[140px]" />
                <HeaderCell label="Access" className="w-[150px]" />
                <th className="w-10 px-2 py-2 text-right">
                  <MoreHorizontal className="ml-auto h-4 w-4" />
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) =>
                row.kind === "folder" ? (
                  <CloudFolderBrowserRow
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
                  <CloudFileBrowserRow
                    key={row.file.id}
                    file={row.file}
                    selected={selectedIds.includes(row.file.id)}
                    imageSelected={selectedImageIds.has(`cloud:${row.file.id}`)}
                    disabled={disabledFileIds?.has(row.file.id) ?? false}
                    resolving={resolvingId === row.file.id}
                    ownerLabel={
                      row.file.ownerId === currentUserId ? "You" : "—"
                    }
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
            </tbody>
          </table>
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
        <ShareLinkDialog
          open={!!shareTarget}
          onOpenChange={(open) => {
            if (!open) setShareTarget(null);
          }}
          resourceId={shareTarget.resourceId}
          resourceType={shareTarget.resourceType}
        />
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
              <MediaThumbnail file={file} iconSize={18} className="h-full w-full" />
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
    if (url) toast.success("Link copied");
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

function HeaderCell({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-2 py-2 text-left font-medium text-muted-foreground",
        className,
      )}
    >
      {label}
    </th>
  );
}

function CloudFolderBrowserRow({
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
    <tr
      className={cn(
        "group border-b text-sm transition-colors hover:bg-accent/40",
        selected && "bg-accent/70",
      )}
      onDoubleClick={onOpen}
    >
      <SelectCell
        checked={selected}
        label={`Select ${folder.folderName}`}
        onChange={onToggleSelected}
      />
      <td className="px-2 py-2">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 items-center gap-2 text-left font-medium"
        >
          <FileIcon isFolder size={20} />
          <span className="truncate">{folder.folderName}</span>
        </button>
      </td>
      <td className="px-2 py-2">
        <TypeBadge label="DIR" />
        <span className="ml-2 text-muted-foreground">Folder</span>
      </td>
      <td className="px-2 py-2 text-muted-foreground">{ownerLabel}</td>
      <td className="px-2 py-2 text-muted-foreground">—</td>
      <td className="px-2 py-2 text-muted-foreground">
        {formatRelativeTime(folder.updatedAt)}
      </td>
      <td className="px-2 py-2">
        <AccessCell visibility={folder.visibility} />
      </td>
      <RowActionsCell
        onShare={onShare}
        onCopyLink={async () => actions.copyShareUrl()}
      />
    </tr>
  );
}

function CloudFileBrowserRow({
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
    <tr
      className={cn(
        "group border-b text-sm transition-colors hover:bg-accent/40",
        selected && "bg-accent/70",
        imageSelected && "border-l-2 border-l-primary bg-primary/10",
        disabled && "opacity-70",
      )}
      onDoubleClick={() => {
        if (!disabled && !resolving) onActivate();
      }}
    >
      <SelectCell
        checked={selected}
        label={`Select ${file.fileName}`}
        onChange={onToggleSelected}
      />
      <td className="px-2 py-2">
        <button
          type="button"
          disabled={disabled || resolving}
          onClick={onActivate}
          className="flex min-w-0 items-center gap-2 text-left font-medium disabled:cursor-not-allowed"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/40">
            {showThumb ? (
              <MediaThumbnail file={file} iconSize={18} className="h-full w-full" />
            ) : (
              <FileIcon fileName={file.fileName} size={18} />
            )}
          </span>
          <span className="truncate">{file.fileName}</span>
          {resolving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          ) : null}
          {disabled ? (
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          ) : null}
        </button>
      </td>
      <td className="px-2 py-2 text-muted-foreground">
        <TypeBadge label={extensionLabel(file.fileName)} />
        <span className="ml-2">{getCloudFileKindLabel(file)}</span>
      </td>
      <td className="px-2 py-2 text-muted-foreground">{ownerLabel}</td>
      <td className="px-2 py-2 text-muted-foreground">
        {formatFileSize(file.fileSize)}
      </td>
      <td className="px-2 py-2 text-muted-foreground">
        {formatRelativeTime(file.updatedAt)}
      </td>
      <td className="px-2 py-2">
        <AccessCell visibility={file.visibility} />
      </td>
      <RowActionsCell
        onShare={onShare}
        onCopyLink={async () => actions.copyShareUrl()}
      />
    </tr>
  );
}

function SelectCell({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <td className="w-8 px-3 py-2">
      <Checkbox checked={checked} onCheckedChange={onChange} aria-label={label} />
    </td>
  );
}

function RowActionsCell({
  onShare,
  onCopyLink,
}: {
  onShare: () => void;
  onCopyLink: () => Promise<string | null>;
}) {
  const handleCopy = async () => {
    const url = await onCopyLink();
    if (url) toast.success("Link copied");
  };
  return (
    <td className="w-10 px-2 py-2">
      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
    </td>
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
            <DropdownMenuItem onClick={() => onVisibility("private")}>
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
    <span className="inline-flex rounded border border-info/40 bg-info/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-info">
      {label}
    </span>
  );
}

function extensionLabel(fileName: string) {
  const ext = fileName.split(".").pop();
  return ext ? ext.slice(0, 4).toUpperCase() : "FILE";
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
