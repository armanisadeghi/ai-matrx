/**
 * features/files/components/core/FilePreview/previewers/GenericPreview.tsx
 *
 * Fallback when no specific previewer is available. Shows an icon, file
 * metadata, and one-or-two action buttons:
 *
 *   - Always: "Download" (when an `onDownload` callback is provided).
 *   - Optional: "View as text" — used by the code workspace's
 *     `BinaryFileViewer` to offer a one-click escape hatch for files
 *     that look text-shaped at the byte level even though their
 *     filename / extension wasn't recognized as text. The button can
 *     render either as the primary action (`viewAsTextPrimary` —
 *     default when the byte sniff is confident) or as a secondary
 *     outlined action (when the file might be binary but we still want
 *     to expose the override).
 */

"use client";

import { Download, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FileIcon } from "@/features/files/components/core/FileIcon/FileIcon";
import { formatFileSize } from "@/features/files/utils/format";

// ---------------------------------------------------------------------------
// DEBUG layering visualization — paired with the rings in PreviewPane,
// FilePreview, and PdfPreview. Rip this out when done.
// ---------------------------------------------------------------------------
const DEBUG_RING_GENERIC_PREVIEW = "ring-2 ring-inset ring-fuchsia-500";

export interface GenericPreviewProps {
  fileName: string;
  fileSize: number | null;
  onDownload?: () => void;
  /**
   * If provided, surfaces a "View as text" button. Use cases: forcing a
   * file with no text extension into Monaco, inspecting an unknown blob
   * we suspect is text, etc. The callback is responsible for actually
   * doing the conversion (e.g. dispatching `convertTabToEditor`).
   */
  onViewAsText?: () => void;
  /** Override the button label. Defaults to `"View as text"`. */
  viewAsTextLabel?: string;
  /**
   * When `true`, render the View as text action as the primary button
   * and demote Download to the secondary slot. Used when a byte sniff
   * gave us high confidence the file is text — making the escape hatch
   * the obvious next click.
   */
  viewAsTextPrimary?: boolean;
  /**
   * When `true`, the View as text button shows a spinner and disables
   * itself. Wire this to whatever async conversion is in flight so
   * users can't double-fire it.
   */
  viewAsTextBusy?: boolean;
  /**
   * Custom message line above the actions. Defaults to a generic "this
   * file type can't be previewed" sentence.
   */
  message?: string;
  className?: string;
}

export function GenericPreview({
  fileName,
  fileSize,
  onDownload,
  onViewAsText,
  viewAsTextLabel = "View as text",
  viewAsTextPrimary = true,
  viewAsTextBusy = false,
  message,
  className,
}: GenericPreviewProps) {
  const hasViewAsText = typeof onViewAsText === "function";
  const hasDownload = typeof onDownload === "function";

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center",
        DEBUG_RING_GENERIC_PREVIEW,
        className,
      )}
    >
      <span className="pointer-events-none absolute left-0 top-0 z-50 select-none rounded-br bg-fuchsia-500 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white shadow">
        GenericPreview
      </span>
      <FileIcon fileName={fileName} size={48} />
      <div>
        <p className="text-sm font-medium truncate max-w-md">{fileName}</p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(fileSize)}
        </p>
      </div>
      <p className="text-sm text-muted-foreground max-w-sm">
        {message ??
          (hasViewAsText
            ? "No built-in previewer for this file type."
            : "This file type can't be previewed here.")}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {onViewAsText && viewAsTextPrimary ? (
          <ViewAsTextButton
            onClick={onViewAsText}
            label={viewAsTextLabel}
            busy={viewAsTextBusy}
            variant="primary"
          />
        ) : null}
        {hasDownload ? (
          <button
            type="button"
            onClick={onDownload}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm",
              hasViewAsText && viewAsTextPrimary
                ? "border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            <Download className="h-4 w-4" />
            Download
          </button>
        ) : null}
        {onViewAsText && !viewAsTextPrimary ? (
          <ViewAsTextButton
            onClick={onViewAsText}
            label={viewAsTextLabel}
            busy={viewAsTextBusy}
            variant="secondary"
          />
        ) : null}
      </div>
    </div>
  );
}

interface ViewAsTextButtonProps {
  onClick: () => void;
  label: string;
  busy: boolean;
  variant: "primary" | "secondary";
}

function ViewAsTextButton({
  onClick,
  label,
  busy,
  variant,
}: ViewAsTextButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
        "disabled:opacity-60 disabled:cursor-not-allowed",
        variant === "primary"
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileText className="h-4 w-4" />
      )}
      {label}
    </button>
  );
}

export default GenericPreview;
