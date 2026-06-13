/**
 * features/files/components/surfaces/dropbox/NewMenu.tsx
 *
 * Dropdown opened by the "+ New" button in the top bar. Upload files, upload
 * folder, create folder — all wired to existing thunks.
 */

"use client";

import { useCallback, useRef, useState } from "react";
import { extractErrorMessage } from "@/utils/errors";
import { FileUp, FolderPlus, FolderUp, Plus } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { createFolder } from "@/features/files/redux/thunks";
import { setFocusedId } from "@/features/files/redux/slice";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { useRagUploadPreference } from "@/features/files/handler/hooks/useRagUploadPreference";
import { TooltipIcon } from "@/features/files/components/core/Tooltip/TooltipIcon";

export interface NewMenuProps {
  parentFolderId: string | null;
  className?: string;
}

export function NewMenu({ parentFolderId, className }: NewMenuProps) {
  const dispatch = useAppDispatch();
  const { uploadMany: upload } = useFileUpload();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const folderNameInputRef = useRef<HTMLInputElement | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const handleUploadFiles = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length) {
        void (async () => {
          const result = await upload(files, { parentFolderId });
          // Focus the last successfully uploaded file so it's highlighted
          if (result?.uploaded?.length) {
            dispatch(setFocusedId(result.uploaded[result.uploaded.length - 1]));
          }
        })();
      }
      event.target.value = "";
    },
    [dispatch, upload, parentFolderId],
  );

  const handleUploadFolder = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length) {
        void (async () => {
          const result = await upload(files, { parentFolderId });
          if (result?.uploaded?.length) {
            dispatch(setFocusedId(result.uploaded[result.uploaded.length - 1]));
          }
        })();
      }
      event.target.value = "";
    },
    [dispatch, upload, parentFolderId],
  );

  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) {
      setCreateError("Enter a folder name.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const folderId = await dispatch(
        createFolder({ folderName: name, parentId: parentFolderId }),
      ).unwrap();
      // Move focus to the newly created folder so it's highlighted and scrolled
      // into view immediately.
      dispatch(setFocusedId(folderId));
      setNewFolderName("");
      setCreateOpen(false);
    } catch (err) {
      setCreateError(extractErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }, [dispatch, newFolderName, parentFolderId]);

  return (
    <>
      <DropdownMenu>
        <TooltipIcon label="Upload files or create a folder">
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm",
                "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                className,
              )}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New
            </button>
          </DropdownMenuTrigger>
        </TooltipIcon>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
            <FileUp className="mr-2 h-4 w-4" />
            Upload files
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => folderInputRef.current?.click()}>
            <FolderUp className="mr-2 h-4 w-4" />
            Upload folder
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <FolderPlus className="mr-2 h-4 w-4" />
            New folder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={handleUploadFiles}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        hidden
        onChange={handleUploadFolder}
        // @ts-expect-error — non-standard but widely supported
        webkitdirectory="true"
        directory=""
      />

      <AlertDialog open={createOpen} onOpenChange={setCreateOpen}>
        <AlertDialogContent
          onOpenAutoFocus={(e) => {
            // Radix moves focus to the cancel button by default; override to focus
            // the name input so the user can immediately type.
            e.preventDefault();
            folderNameInputRef.current?.focus();
            folderNameInputRef.current?.select();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>New folder</AlertDialogTitle>
            <AlertDialogDescription>
              Name it something memorable — you can rename it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            ref={folderNameInputRef}
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Untitled folder"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            style={{ fontSize: "16px" }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleCreateFolder();
              }
            }}
          />
          {createError ? (
            <p className="text-xs text-destructive">{createError}</p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCreateError(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleCreateFolder();
              }}
              disabled={creating}
            >
              Create
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
