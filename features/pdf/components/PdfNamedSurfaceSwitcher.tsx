"use client";

/**
 * PdfNamedSurfaceSwitcher — ONE glass pill: PDF icon + editable filename +
 * surface switcher + file context menu.
 *
 * The extractor studio pattern (`PdfStudioDocTitle`) collapsed into a single
 * drop-anywhere unit: everything renders INSIDE one `TapTargetButtonGroup`
 * pill — no separate name background, no second control cluster.
 *
 *   ( [pdf] filename.pdf  [layers]  [···] )
 *
 * - Filename: text-[11px], truncated (`nameMaxWidthClassName` caps it —
 *   filenames are ugly/erratic/long), click-to-edit via `EditableLabel`
 *   when `onRename` is provided; right-click opens the file menu.
 * - Layers: the canonical `PdfSurfaceSwitcher` (group variant).
 * - ···: the full /files action set (`FileContextMenu`) for cloud-backed
 *   files — hydrated via `useEnsureCloudFile` so the menu lights up on any
 *   surface. Omitted when there's no fileId.
 *
 * Tap-target hygiene: geometry lives in globals.css (`.matrx-tap-*`); the
 * name span adds only inline padding INSIDE the pill — never around the
 * group or its buttons.
 */

import { useRef, useState } from "react";
import { getFileTypeDetails } from "@/features/files/utils/file-types";
import { EditableLabel } from "@/components/official/item/EditableLabel";
import { MoreHorizontalTapButton } from "@/components/icons/tap-buttons";
import { TapTargetButtonGroup } from "@/components/icons/TapTargetButton";
import { FileContextMenu } from "@/features/files/components/core/FileContextMenu/FileContextMenu";
import { FileRightClickMenu } from "@/features/files/components/core/FileContextMenu/FileRightClickMenu";
import { useEnsureCloudFile } from "@/features/files/hooks/useEnsureCloudFile";
import { cn } from "@/lib/utils";
import type { PdfSurfaceId } from "@/features/pdf/surfaces/registry";
import { PdfSurfaceSwitcher } from "./PdfSurfaceSwitcher";

// PDF-only by definition — resolve the registry entry once so icon + color
// always match how /files renders PDFs.
const PDF_TYPE = getFileTypeDetails("document.pdf");
const PdfIcon = PDF_TYPE.icon;

export interface PdfNamedSurfaceSwitcherProps {
  /** The surface currently rendering this PDF (marked + non-navigable). */
  current: PdfSurfaceId;
  fileId?: string | null;
  processedDocumentId?: string | null;
  /** Display name — truncated at text-[11px]; full name while editing. */
  fileName: string;
  /**
   * Commit a new name (host persists — e.g. `renameFile` thunk, or a doc
   * rename). Omit to render the name read-only (no click-to-edit).
   */
  onRename?: (next: string) => void | Promise<void>;
  /** Fired after the ··· / right-click menu deletes the file. */
  onDeleted?: () => void;
  /** Hide the PDF icon (default shown). */
  showIcon?: boolean;
  /** Hide the ··· file menu even when a fileId exists (default shown). */
  showMenu?: boolean;
  /** Tailwind max-width cap on the name (default `max-w-40` = 10rem). */
  nameMaxWidthClassName?: string;
  className?: string;
}

export function PdfNamedSurfaceSwitcher({
  current,
  fileId,
  processedDocumentId,
  fileName,
  onRename,
  onDeleted,
  showIcon = true,
  showMenu = true,
  nameMaxWidthClassName = "max-w-40",
  className,
}: PdfNamedSurfaceSwitcherProps) {
  // Hydrate the cloud-file row so FileContextMenu / FileRightClickMenu light
  // up on surfaces outside the /files tree. No-op without a fileId.
  useEnsureCloudFile(fileId ?? null);
  const hasFileMenu = Boolean(fileId) && showMenu;

  // Edit mode must never SHRINK the name box (a collapsing input reads as
  // broken). On edit start we capture the display's rendered width and hold
  // it as a floor, while letting the box expand to a comfortable typing
  // width (w-64) when there's room.
  const nameBoxRef = useRef<HTMLSpanElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [editMinWidth, setEditMinWidth] = useState<number | null>(null);
  const handleEditingChange = (next: boolean) => {
    if (next && nameBoxRef.current) {
      setEditMinWidth(nameBoxRef.current.offsetWidth);
    }
    setEditing(next);
  };

  const identity = (
    <span className="flex min-w-0 items-center gap-1 pl-2.5">
      {showIcon && (
        <PdfIcon
          aria-hidden
          className={cn("h-3.5 w-3.5 shrink-0", PDF_TYPE.color)}
        />
      )}
      <span
        ref={nameBoxRef}
        className={cn(
          "block min-w-0",
          editing ? "w-64" : nameMaxWidthClassName,
        )}
        style={
          editing && editMinWidth !== null
            ? { minWidth: editMinWidth }
            : undefined
        }
      >
        {onRename ? (
          <EditableLabel
            value={fileName}
            onCommit={onRename}
            onEditingChange={handleEditingChange}
            activation="click"
            ariaLabel="File name"
            maxLength={200}
            displayClassName="text-[11px] font-medium text-foreground"
            inputClassName="md:text-[11px] font-medium"
          />
        ) : (
          <span
            title={fileName}
            className="block truncate px-1 text-[11px] font-medium text-foreground"
          >
            {fileName}
          </span>
        )}
      </span>
    </span>
  );

  return (
    <TapTargetButtonGroup className={className}>
      {hasFileMenu && fileId ? (
        <FileRightClickMenu fileId={fileId} onDeleted={onDeleted}>
          {identity}
        </FileRightClickMenu>
      ) : (
        identity
      )}
      <PdfSurfaceSwitcher
        current={current}
        fileId={fileId}
        processedDocumentId={processedDocumentId}
        triggerVariant="group"
      />
      {hasFileMenu && fileId && (
        <FileContextMenu fileId={fileId} onDeleted={onDeleted}>
          <MoreHorizontalTapButton variant="group" ariaLabel="File actions" />
        </FileContextMenu>
      )}
    </TapTargetButtonGroup>
  );
}
