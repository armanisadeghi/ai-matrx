"use client";

/**
 * PdfNamedSurfaceSwitcher — PdfSurfaceSwitcher + document identity, one unit.
 *
 * The plain switcher is an anonymous [layers] button; hosts that render a
 * PDF chip/toolbar row usually also need the filename next to it. This
 * composes the canonical pieces (never forks them):
 *   - a small PDF type icon from the file-type registry (optional, either side)
 *   - the filename at text-xs, truncated with an ellipsis (filenames are
 *     ugly/erratic/long — the cap is the host's `nameMaxWidthClassName`),
 *     click-to-edit in place via `EditableLabel` when `onRename` is provided
 *   - the surface switcher in its own `TapTargetButtonGroup` pill
 *
 * Tap-target hygiene: geometry lives in globals.css (`.matrx-tap-*`); this
 * component adds NO padding/margins around the group — the group pill and its
 * 32px sm targets must stay exactly as the system renders them.
 */

import { getFileTypeDetails } from "@/features/files/utils/file-types";
import { EditableLabel } from "@/components/official/item/EditableLabel";
import { TapTargetButtonGroup } from "@/components/icons/TapTargetButton";
import { cn } from "@/lib/utils";
import type { PdfSurfaceId } from "@/features/pdf/surfaces/registry";
import { PdfSurfaceSwitcher } from "./PdfSurfaceSwitcher";

// This component is PDF-only by definition — resolve the registry entry once
// so icon + color always match how /files renders PDFs.
const PDF_TYPE = getFileTypeDetails("document.pdf");
const PdfIcon = PDF_TYPE.icon;

export interface PdfNamedSurfaceSwitcherProps {
  /** The surface currently rendering this PDF (marked + non-navigable). */
  current: PdfSurfaceId;
  fileId?: string | null;
  processedDocumentId?: string | null;
  /** Display name — shown truncated at text-xs; full name while editing. */
  fileName: string;
  /**
   * Commit a new name (host persists — e.g. `renameFile` thunk, or a doc
   * rename). Omit to render the name read-only (no click-to-edit).
   */
  onRename?: (next: string) => void | Promise<void>;
  /** PDF icon placement relative to the name. Default "start". */
  icon?: "start" | "end" | "none";
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
  icon = "start",
  nameMaxWidthClassName = "max-w-40",
  className,
}: PdfNamedSurfaceSwitcherProps) {
  const iconEl = (
    <PdfIcon
      aria-hidden
      className={cn("h-3.5 w-3.5 shrink-0", PDF_TYPE.color)}
    />
  );

  return (
    <div className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      {icon === "start" && iconEl}
      <div className={cn("min-w-0", nameMaxWidthClassName)}>
        {onRename ? (
          <EditableLabel
            value={fileName}
            onCommit={onRename}
            activation="click"
            ariaLabel="File name"
            maxLength={200}
            displayClassName="text-xs font-medium text-foreground"
            inputClassName="md:text-xs font-medium"
          />
        ) : (
          <span
            title={fileName}
            className="block truncate px-1 text-xs font-medium text-foreground"
          >
            {fileName}
          </span>
        )}
      </div>
      {icon === "end" && iconEl}
      <TapTargetButtonGroup>
        <PdfSurfaceSwitcher
          current={current}
          fileId={fileId}
          processedDocumentId={processedDocumentId}
          triggerVariant="group"
        />
      </TapTargetButtonGroup>
    </div>
  );
}
