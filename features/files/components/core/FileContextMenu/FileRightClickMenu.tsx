/**
 * features/files/components/core/FileContextMenu/FileRightClickMenu.tsx
 *
 * RIGHT-CLICK file menu — wraps any element (chips, table rows, grid cells,
 * preview surfaces) so a right-click gets the file actions. Consolidated onto
 * the ONE universal context menu (v3): the file actions ride in as
 * `extraSections` (handlers from the same `useFileMenuActions(fileId)` hook
 * the 3-dot DropdownMenu uses, so the two can't drift), and the standard menu
 * adds Copy / AI actions / agents / Attach To / Share for free.
 *
 * Consumer contract unchanged: same props (`fileId`, `children`, `disabled`,
 * `onDeleted`). Delete confirms through the global ConfirmDialog.
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
  FileContextDialog,
  FILE_CONTEXT_MENU_LABEL,
  FileContextMenuIcon,
} from "@/features/files/components/FileContextSection";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAllFilesMap } from "@/features/files/redux/selectors";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
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
  const filesById = useAppSelector(selectAllFilesMap);
  const file = filesById[fileId];
  const [contextOpen, setContextOpen] = useState(false);

  if (disabled) return <>{children}</>;

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete file?",
      description:
        "This will move the file to trash. You can restore it from versions for 30 days before bytes are removed.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await a.deleteFile();
      await onDeleted?.(fileId);
    } catch (err) {
      console.warn("[FileRightClickMenu] delete failed:", err);
    }
  };

  const extraSections: ContextMenuExtraSection[] = [
    {
      id: "file-actions",
      anchor: "after-clipboard",
      items: [
        {
          kind: "item",
          id: "file-preview",
          label: "Preview",
          icon: Eye,
          onSelect: a.preview,
        },
        {
          kind: "item",
          id: "file-download",
          label: "Download",
          icon: Download,
          onSelect: () => void a.download(),
        },
        {
          kind: "item",
          id: "file-copy-link",
          label: "Copy link",
          icon: Copy,
          hint: `${a.cmd}L`,
          onSelect: () => void a.copyShareUrl(),
        },
        {
          kind: "item",
          id: "file-details",
          label: "Show details",
          icon: FileText,
          onSelect: a.showDetails,
        },
        {
          kind: "item",
          id: "file-versions",
          label: "Show versions",
          icon: History,
          onSelect: a.showVersions,
        },
        {
          kind: "item",
          id: "file-context",
          label: FILE_CONTEXT_MENU_LABEL,
          icon: FileContextMenuIcon,
          onSelect: () => setContextOpen(true),
        },
        {
          kind: "submenu",
          id: "file-visibility",
          label: "Visibility",
          icon: Lock,
          children: [
            {
              kind: "item",
              id: "vis-personal",
              label: "Private",
              icon: Lock,
              onSelect: () => void a.setVisibility("personal"),
            },
            {
              kind: "item",
              id: "vis-shared",
              label: "Shared",
              icon: Users,
              onSelect: () => void a.setVisibility("link"),
            },
            {
              kind: "item",
              id: "vis-public",
              label: "Public",
              icon: Globe,
              onSelect: () => void a.setVisibility("public"),
            },
          ],
        },
        {
          kind: "item",
          id: "file-delete",
          label: "Delete",
          icon: Trash2,
          destructive: true,
          hint: "⌫",
          onSelect: () => void handleDelete(),
        },
      ],
    },
  ];

  return (
    <>
      <NonEditableContextMenu
        sourceFeature="files"
        surfaceName="matrx-user/files"
        contextData={{
          content: file?.fileName ?? "",
          active_file_id: fileId,
          active_file_name: file?.fileName ?? "",
          active_file_mime_type: file?.mimeType ?? "",
        }}
        entity={
          file
            ? {
                type: "file",
                id: fileId,
                title: file.fileName,
                resourceType: "file",
              }
            : undefined
        }
        extraSections={extraSections}
        enableFloatingIcon={false}
      >
        {children}
      </NonEditableContextMenu>

      {file ? (
        <FileContextDialog
          fileId={fileId}
          fileName={file.fileName}
          open={contextOpen}
          onOpenChange={setContextOpen}
        />
      ) : null}
    </>
  );
}

export default FileRightClickMenu;
