/**
 * features/files/components/core/FolderContextMenu/FolderContextMenu.tsx
 *
 * Three-dot menu for a folder. Headless: parent supplies the trigger via
 * `children`; this component renders the items. Mirror of FileContextMenu —
 * folders get the same vocabulary (Open, Copy link, Share, Move, Rename,
 * Visibility, New inside, Delete) so users don't have to learn two menus.
 *
 * Virtual folders (Notes / Code Snippets / Agent Apps adapter roots) hide
 * actions that don't apply to their backing store — Copy link / Share /
 * Visibility — because share-token semantics + the Python file ACL tables
 * only cover real cloud-folders today.
 */

"use client";

import { useCallback, useState } from "react";
import {
  Building2,
  Copy,
  Edit2,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Globe,
  Info,
  Lock,
  Scissors,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectFolderById } from "@/features/files/redux/selectors";
import { setActiveFolderId } from "@/features/files/redux/slice";
import { extractErrorMessage } from "@/utils/errors";
import { RenameDialog } from "@/features/files/components/core/RenameDialog/RenameDialog";
import { ShareLinkDialog } from "@/features/files/components/core/ShareLinkDialog/ShareLinkDialog";
import { openFolderPicker } from "@/features/files/components/pickers/CloudFilesPickerHost";
import { useFolderActions } from "@/features/files/components/core/FileActions/useFolderActions";
import { setClipboard } from "@/features/files/utils/clipboard";
import type { Visibility } from "@/features/files/types";

export interface FolderContextMenuProps {
  folderId: string;
  children: React.ReactNode;
  /** Override the default rename UI (built-in dialog). */
  onRename?: () => void;
  /** Override the default move UI (built-in folder picker). */
  onMove?: () => void;
  /** Override the default new-folder-inside UI. */
  onNewFolderInside?: () => void;
  /** Open / activate the folder (navigate into it). */
  onOpen?: () => void;
  disabled?: boolean;
}

export function FolderContextMenu({
  folderId,
  children,
  onRename,
  onMove,
  onNewFolderInside,
  onOpen,
  disabled,
}: FolderContextMenuProps) {
  const dispatch = useAppDispatch();
  const folder = useAppSelector((s) => selectFolderById(s, folderId));
  const actions = useFolderActions(folderId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Synthetic ids belong to virtual sources. Hide actions that don't
  // round-trip cleanly through the cloud-files Python contract.
  const isVirtual = folder?.source.kind === "virtual";

  const cmd =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform)
      ? "⌘"
      : "Ctrl";

  const handleRename = onRename ?? (() => setRenameOpen(true));

  const handleOpen = useCallback(() => {
    if (onOpen) {
      onOpen();
      return;
    }
    // Default: set this as the active folder so the file table navigates
    // into it.
    dispatch(setActiveFolderId(folderId));
  }, [dispatch, folderId, onOpen]);

  const handleMove = useCallback(async () => {
    if (onMove) {
      onMove();
      return;
    }
    if (!folder) return;
    const newParent = await openFolderPicker({
      title: "Move folder to…",
    });
    if (newParent === undefined) return;
    if (newParent === folder.parentId) return;
    // Cycle guard — refuse to drop a folder into itself or a descendant.
    // The picker can't enforce this client-side without the full tree.
    // The server also rejects, but we save a round-trip.
    if (newParent === folderId) return;
    try {
      await actions.move(newParent);
    } catch {
      /* error surfaces via slice state */
    }
  }, [actions, folder, folderId, onMove]);

  const handleNewFolderInside = useCallback(() => {
    if (onNewFolderInside) {
      onNewFolderInside();
      return;
    }
    // Without a host-provided handler we can't create a folder
    // interactively here. Emit a window event so a top-level New Folder
    // host can pick it up; if no host exists it's a no-op.
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("cloud-files:new-folder-inside", {
          detail: { parentFolderId: folderId },
        }),
      );
    }
  }, [folderId, onNewFolderInside]);

  const handleVisibility = useCallback(
    async (visibility: Visibility) => {
      try {
        await actions.setVisibility(visibility);
      } catch {
        /* error surfaces via slice state */
      }
    },
    [actions],
  );

  const handleCopyLink = useCallback(async () => {
    try {
      await actions.copyShareUrl();
    } catch {
      /* swallow — user can use the Share dialog directly */
    }
  }, [actions]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await actions.delete();
      setConfirmOpen(false);
    } catch (err) {
      setDeleteError(extractErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }, [actions]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          {children}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={handleOpen}>
            <FolderOpen className="mr-2 h-4 w-4" />
            Open
          </DropdownMenuItem>

          {!isVirtual ? (
            <>
              <DropdownMenuItem onClick={() => void handleCopyLink()}>
                <Copy className="mr-2 h-4 w-4" />
                Copy link
                <DropdownMenuShortcut>{cmd}L</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShareOpen(true)}>
                <Share2 className="mr-2 h-4 w-4" />
                Share…
              </DropdownMenuItem>
            </>
          ) : null}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() =>
              setClipboard({
                op: "cut",
                items: [
                  {
                    id: folderId,
                    kind: "folder",
                    source: isVirtual ? "virtual" : "real",
                  },
                ],
                setAt: Date.now(),
              })
            }
          >
            <Scissors className="mr-2 h-4 w-4" />
            Cut
            <DropdownMenuShortcut>{cmd}X</DropdownMenuShortcut>
          </DropdownMenuItem>
          {!isVirtual ? (
            <DropdownMenuItem
              onClick={() =>
                setClipboard({
                  op: "copy",
                  items: [{ id: folderId, kind: "folder", source: "real" }],
                  setAt: Date.now(),
                })
              }
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy
              <DropdownMenuShortcut>{cmd}C</DropdownMenuShortcut>
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={handleRename}>
            <Edit2 className="mr-2 h-4 w-4" />
            Rename
            <DropdownMenuShortcut>F2</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void handleMove()}>
            <FolderInput className="mr-2 h-4 w-4" />
            Move…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleNewFolderInside}>
            <FolderPlus className="mr-2 h-4 w-4" />
            New folder inside
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("cloud-files:open-folder-info", {
                    detail: { folderId },
                  }),
                );
              }
            }}
          >
            <Info className="mr-2 h-4 w-4" />
            Folder info
          </DropdownMenuItem>

          {!isVirtual ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Lock className="mr-2 h-4 w-4" />
                Visibility
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  onClick={() => void handleVisibility("personal")}
                >
                  <Lock className="mr-2 h-4 w-4" />
                  Private
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void handleVisibility("internal")}
                >
                  <Building2 className="mr-2 h-4 w-4" />
                  Organization
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void handleVisibility("link")}>
                  <Users className="mr-2 h-4 w-4" />
                  Anyone with the link
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void handleVisibility("public")}
                >
                  <Globe className="mr-2 h-4 w-4" />
                  Public
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete folder
            <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setDeleteError(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              {folder ? (
                <>
                  Move <strong>{folder.folderName}</strong> and all of its
                  contents to Trash. You can restore it later.
                </>
              ) : (
                "Move this folder and all of its contents to Trash."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <p className="text-xs text-destructive">{deleteError}</p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {folder && !onRename ? (
        <RenameDialog
          open={renameOpen}
          onOpenChange={setRenameOpen}
          kind="folder"
          resourceId={folderId}
          currentName={folder.folderName}
        />
      ) : null}

      {!isVirtual ? (
        <ShareLinkDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          resourceId={folderId}
          resourceType="folder"
        />
      ) : null}
    </>
  );
}
