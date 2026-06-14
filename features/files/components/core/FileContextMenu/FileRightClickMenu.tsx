/**
 * features/files/components/core/FileContextMenu/FileRightClickMenu.tsx
 *
 * RIGHT-CLICK file menu — wraps any element so the user can right-click
 * on it and get the same set of file actions they'd get from the 3-dot
 * dropdown menu in cloud-files. Use this on chips, table rows, grid
 * cells, preview surfaces — anywhere a file is rendered.
 *
 * Left-click behavior on the wrapped element is preserved (we use
 * Radix's `ContextMenu` primitive, which only intercepts the browser's
 * `contextmenu` event).
 *
 * Why this exists separate from `FileContextMenu`:
 *   - `FileContextMenu` uses `DropdownMenu` and is anchored to a 3-dot
 *     button — its trigger is a click event on a small icon.
 *   - `FileRightClickMenu` uses `ContextMenu` and triggers on the
 *     browser-native right-click anywhere on the wrapped element.
 *   - Both pull their handlers from the same `useFileMenuActions(fileId)`
 *     hook so we don't accidentally drift between the two.
 */

"use client";

import { useState } from "react";
import {
  Copy,
  Download,
  Eye,
  FileText,
  Globe,
  History,
  Lock,
  Trash2,
  Users,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu/context-menu";
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
import { useFileMenuActions } from "./useFileMenuActions";

export interface FileRightClickMenuProps {
  fileId: string;
  /** The element the user can right-click on. */
  children: React.ReactNode;
  /** When true, the right-click trigger is disabled (no menu opens). */
  disabled?: boolean;
  /**
   * Fired after the file is successfully deleted. Lets a host surface that
   * tracks its own list keyed off the file react (e.g. the PDF studio
   * archives the matching `processed_documents` row). Receives the file id.
   */
  onDeleted?: (fileId: string) => void | Promise<void>;
}

export function FileRightClickMenu({
  fileId,
  children,
  disabled,
  onDeleted,
}: FileRightClickMenuProps) {
  const a = useFileMenuActions(fileId);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (disabled) return <>{children}</>;

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem onClick={a.preview}>
            <Eye className="mr-2 h-4 w-4" />
            Preview
          </ContextMenuItem>
          <ContextMenuItem onClick={() => void a.download()}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </ContextMenuItem>
          <ContextMenuItem onClick={() => void a.copyShareUrl()}>
            <Copy className="mr-2 h-4 w-4" />
            Copy link
            <ContextMenuShortcut>{a.cmd}L</ContextMenuShortcut>
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem onClick={a.showDetails}>
            <FileText className="mr-2 h-4 w-4" />
            Show details
          </ContextMenuItem>
          <ContextMenuItem onClick={a.showVersions}>
            <History className="mr-2 h-4 w-4" />
            Show versions
          </ContextMenuItem>

          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Lock className="mr-2 h-4 w-4" />
              Visibility
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem onClick={() => void a.setVisibility("private")}>
                <Lock className="mr-2 h-4 w-4" />
                Private
              </ContextMenuItem>
              <ContextMenuItem onClick={() => void a.setVisibility("shared")}>
                <Users className="mr-2 h-4 w-4" />
                Shared
              </ContextMenuItem>
              <ContextMenuItem onClick={() => void a.setVisibility("public")}>
                <Globe className="mr-2 h-4 w-4" />
                Public
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSeparator />

          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
            <ContextMenuShortcut>⌫</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete file?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the file to trash. You can restore it from versions
              for 30 days before bytes are removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                void (async () => {
                  try {
                    await a.deleteFile();
                    await onDeleted?.(fileId);
                  } catch (err) {
                    // eslint-disable-next-line no-console
                    console.warn("[FileRightClickMenu] delete failed:", err);
                  }
                })();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default FileRightClickMenu;
