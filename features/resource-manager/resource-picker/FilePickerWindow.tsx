// features/resource-manager/resource-picker/FilePickerWindow.tsx
//
// THE one and only file-picking overlay: the canonical `FilesResourcePicker`
// (the chat "Stored Files" browser — search, filters, recents, folder tree,
// thumbnails) hosted in a NON-BLOCKING, draggable `WindowPanel`. The page
// behind stays fully interactive.
//
// There is exactly ONE file picker in this codebase: `FilesResourcePicker`.
// Overlay use mounts THIS window; inline use (chat "+" menu) embeds the
// component directly. Never build another picker, list, sheet, or dialog for
// choosing files.
//
// IMPORT LAZILY. `WindowPanel` asserts it was parsed in a lazy chunk
// (features/window-panels/utils/lazy-bundle-guard) because window-panel
// files transitively pull 100+ lazy component references. Callers must use
// `next/dynamic`, never a static import — see features/window-panels
// FEATURE.md → "Bundle invariant".

"use client";

import { useId } from "react";
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
  /** Human-readable scope for the window id (debugging / tray labels). */
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
  // Window ids MUST be unique per mounted instance. The same logical picker
  // can legitimately be on screen twice — e.g. the scope context-item editor
  // renders a live PREVIEW of the real ReferenceValuePicker next to the real
  // field, so a `scopeId`-only id collided. Two WindowPanels sharing an id
  // fight over one Redux entry, and the first unmount dispatches
  // `unregisterWindow(id)` — which silently kills drag for the survivor
  // (`useWindowPanel.onDragStart` bails on a missing entry). `useId` is
  // stable per instance and unique per tree position, so both get their own.
  const instanceId = useId();

  if (!open) return null;

  const handleSelect = async (selection: FileSelection) => {
    const outcome = await onPick(selection);
    if (outcome === "close") onClose();
  };

  return (
    <WindowPanel
      id={`file-picker:${scopeId}:${instanceId}`}
      title={title}
      titleNode={
        <span className="flex items-center gap-1.5">
          <FolderOpen className="size-3.5 text-primary" />
          {title}
        </span>
      }
      onClose={onClose}
      // The window portals to <body>. Radix surfaces (Popover/Select/Dialog)
      // set `pointer-events: none` on <body> while open and can leave it set
      // for a tick after closing — an inherited value makes this window
      // VISIBLE BUT INERT: no drag, no scroll, so the list reads as
      // permanently cut off. Re-assert it for our own subtree.
      className="pointer-events-auto"
      width={460}
      height={600}
      minWidth={340}
      minHeight={400}
      position="center"
      // The picker owns its own scrolling (`fillHost`), so the shell body
      // must not add padding or a competing scroll container.
      bodyClassName="p-0 overflow-hidden"
    >
      <FilesResourcePicker
        onBack={onClose}
        onSelect={(selection) => void handleSelect(selection)}
        initialFilter={initialFilter}
        fillHost
      />
    </WindowPanel>
  );
}

export default FilePickerWindow;
