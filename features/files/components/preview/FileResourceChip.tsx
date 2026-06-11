/**
 * features/files/components/preview/FileResourceChip.tsx
 *
 * Compact, interactive chip for an attached cloud-file. The single chip
 * surface used by both:
 *   - input-area chips (`SmartAgentResourceChips`) before send, with X
 *   - sent-message chips (`AgentUserMessage` AttachmentChip), without X
 *
 * Non-file resources (notes, tasks, webpages, etc.) use
 * `ResourceAttachmentTile` in the same two surfaces.
 *
 * Behaviour:
 *   - Renders the file's representative icon / thumbnail via the central
 *     [`MediaThumbnail`](../core/MediaThumbnail/MediaThumbnail.tsx) — so
 *     image / video files get a real first-frame thumb, everything else
 *     gets the registry's category icon.
 *   - On hover (desktop only, via Radix `HoverCard`), peeks the file:
 *     larger thumbnail + filename + size + type + a tiny "click to open"
 *     hint.
 *   - On click, calls `openFilePreview(fileId)` from the global
 *     [`CloudFilesPreviewHost`](./CloudFilesPreviewHost.tsx) — same full
 *     `<FilePreview>` UX users see in cloud-files itself, no matter
 *     which surface the chip lives on.
 *
 * If the file isn't in the Redux `cloudFiles` slice (e.g. an old message
 * referencing a file that has since been deleted, or a paste before the
 * tree fetch settled), the chip gracefully falls back to a generic
 * "Unknown file" pill — never throws or renders a broken state.
 */

"use client";

import { type ReactNode } from "react";
import { X } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectFileById } from "@/features/files/redux/selectors";
import { formatFileSize } from "@/features/files/utils/format";
import { getFileTypeDetails } from "@/features/files/utils/file-types";
import { FileIcon } from "@/features/files/components/core/FileIcon/FileIcon";
import { MediaThumbnail } from "@/features/files/components/core/MediaThumbnail/MediaThumbnail";
import { FileRightClickMenu } from "@/features/files/components/core/FileContextMenu/FileRightClickMenu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { openFilePreview } from "./openFilePreview";

export interface FileResourceChipProps {
  fileId: string;
  /** When set, renders a small ✕ remove button. Omit to make the chip read-only. */
  onRemove?: () => void;
  /** Compact size — default is medium. Use `"xs"` for sent-message chips. */
  size?: "xs" | "sm";
  /** Override the displayed name (rare — mostly for sub-references). */
  nameOverride?: string;
  /** Optional className passthrough for layout fine-tuning. */
  className?: string;
}

/**
 * The chip we want every file attachment in the app to look like.
 *
 * Use directly when you have a `file_id` — for non-file resources keep
 * using the existing block-specific chips (notes, tasks, webpages, etc.).
 */
export function FileResourceChip({
  fileId,
  onRemove,
  size = "sm",
  nameOverride,
  className,
}: FileResourceChipProps) {
  const file = useAppSelector((s) => selectFileById(s, fileId));

  // Fallback rendering when the file isn't in the slice. We still let the
  // user click — the preview host will fetch on demand and render an
  // honest error if it's truly gone.
  const fileName = nameOverride ?? file?.fileName ?? "Unknown file";
  const fileSize = file?.fileSize ?? null;
  const mimeType = file?.mimeType ?? null;
  const details = getFileTypeDetails(fileName);

  const handleOpen = () => openFilePreview(fileId);

  const thumbSizePx = size === "xs" ? 14 : 18;

  // The chip itself — a small pill with thumbnail + truncated filename
  // (+ optional ✕). Wrapped in a HoverCard for the desktop peek.
  const chip = (
    <button
      type="button"
      onClick={handleOpen}
      title={fileName}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-md border border-border bg-card text-foreground",
        "transition-colors hover:bg-accent hover:border-accent-foreground/20",
        size === "xs"
          ? "h-6 pl-1 pr-1.5 text-[11px] leading-none"
          : "h-7 pl-1 pr-2 text-xs",
        className,
      )}
    >
      {/* Thumb: real image for image/video, category icon otherwise.
          Container forces a square so MediaThumbnail's aspect math is happy. */}
      {file ? (
        <MediaThumbnail
          file={file}
          iconSize={thumbSizePx}
          className={cn(
            size === "xs" ? "h-4 w-4" : "h-5 w-5",
            "shrink-0 rounded-sm",
          )}
          rounded="rounded-sm"
        />
      ) : (
        <FileIcon fileName={fileName} size={thumbSizePx} />
      )}

      <span
        className={cn(
          "truncate",
          size === "xs" ? "max-w-[120px]" : "max-w-[160px]",
        )}
      >
        {fileName}
      </span>

      {onRemove ? (
        <span
          // Use a span+role=button instead of a nested <button>; nested
          // buttons aren't valid HTML. stopPropagation prevents the chip's
          // open-preview click from firing on remove.
          role="button"
          tabIndex={0}
          aria-label={`Remove ${fileName}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }
          }}
          className={cn(
            "ml-0.5 inline-flex shrink-0 items-center justify-center rounded-full",
            "p-0.5 text-muted-foreground/70 hover:bg-black/10 hover:text-foreground",
            "dark:hover:bg-white/10 transition-colors",
          )}
        >
          <X className={size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3"} />
        </span>
      ) : null}
    </button>
  );

  return (
    <FileRightClickMenu fileId={fileId}>
      <HoverCard openDelay={250} closeDelay={120}>
        <HoverCardTrigger asChild>{chip}</HoverCardTrigger>
        <HoverCardContent
          side="top"
          align="start"
          sideOffset={6}
          className="w-72 p-3"
        >
          <FilePeekContent
            fileName={fileName}
            fileSize={fileSize}
            mimeType={mimeType}
            displayName={details.displayName}
            thumb={
              file ? (
                <MediaThumbnail
                  file={file}
                  iconSize={56}
                  className="aspect-[4/3] w-full"
                  rounded="rounded-md"
                />
              ) : (
                <div className="flex aspect-[4/3] w-full items-center justify-center rounded-md bg-muted/50">
                  <FileIcon fileName={fileName} size={48} />
                </div>
              )
            }
          />
        </HoverCardContent>
      </HoverCard>
    </FileRightClickMenu>
  );
}

// ---------------------------------------------------------------------------
// Hover peek body
// ---------------------------------------------------------------------------

function FilePeekContent({
  fileName,
  fileSize,
  mimeType,
  displayName,
  thumb,
}: {
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  displayName: string;
  thumb: ReactNode;
}) {
  return (
    <div className="space-y-2">
      {thumb}
      <div className="space-y-0.5">
        <p
          className="truncate text-sm font-medium leading-tight"
          title={fileName}
        >
          {fileName}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {displayName}
          {fileSize ? ` · ${formatFileSize(fileSize)}` : ""}
          {mimeType && mimeType !== displayName ? ` · ${mimeType}` : ""}
        </p>
      </div>
      <p className="pt-1 text-[10px] text-muted-foreground/80">
        Click to open full preview
      </p>
    </div>
  );
}

export default FileResourceChip;
