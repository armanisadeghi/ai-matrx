// features/resource-manager/resource-picker/FilePickerWindow.tsx
//
// THE one and only file-picking overlay: the canonical `FilesResourcePicker`
// (the Smart Agent Input "Stored Files" browser — search, filters, recents,
// folder tree, thumbnails) hosted in a NON-BLOCKING, draggable `WindowPanel`
// (same shell as ConversationPickerWindow). The page behind stays fully
// interactive.
//
// There is exactly ONE file picker in this codebase: `FilesResourcePicker`.
// Overlay use mounts THIS window; inline use (chat "+" menu) embeds the
// component directly. Never build another picker, list, sheet, or dialog for
// choosing files.

"use client";

import { FolderOpen } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import {
  FilesResourcePicker,
  type FileSelection,
  type FilesResourcePickerFilter,
} from "./FilesResourcePicker";

export type { FileSelection };

export interface FilePickerWindowProps {
  /** Controls mount. */
  open: boolean;
  /** Required — inline-managed close. */
  onClose: () => void;
  /**
   * Fired per picked file. The window stays open for multi-pick; return
   * `"close"` to close it after a pick.
   */
  onPick: (selection: FileSelection) => void | "close" | Promise<void | "close">;
  /** Header title. Default "Choose a file". */
  title?: string;
  /** Unique scope key so two open pickers don't collide. */
  scopeId: string;
  initialFilter?: FilesResourcePickerFilter;
}

export function FilePickerWindow({
  open,
  onClose,
  onPick,
  title = "Choose a file",
  scopeId,
  initialFilter,
}: FilePickerWindowProps) {
  if (!open) return null;

  const handleSelect = async (selection: FileSelection) => {
    const outcome = await onPick(selection);
    if (outcome === "close") onClose();
  };

  return (
    <WindowPanel
      id={`file-picker:${scopeId}`}
      title={title}
      titleNode={
        <span className="flex items-center gap-1.5">
          <FolderOpen className="size-3.5 text-primary" />
          {title}
        </span>
      }
      onClose={onClose}
      width={460}
      height={600}
      minWidth={340}
      minHeight={400}
      position="center"
      bodyClassName="p-2 overflow-y-auto"
    >
      <FilesResourcePicker
        onBack={onClose}
        onSelect={(selection) => void handleSelect(selection)}
        initialFilter={initialFilter}
      />
    </WindowPanel>
  );
}

export default FilePickerWindow;
