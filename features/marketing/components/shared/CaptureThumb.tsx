"use client";

/**
 * Canonical-viewer thumbnails for `files.files`-backed marketing captures.
 *
 * Every screenshot/artifact rendered by Marketing opens the platform file
 * viewer overlay (`useOpenFilePreviewWindow`) — fullscreen, share, download
 * and the rest of the standard file actions come for free. Never wrap these
 * in a bespoke lightbox or a raw `/files/...` anchor.
 */

import type { ReactNode } from "react";
import { InlineMediaRef, fileIdToMediaRef } from "@/features/files";
import { useOpenFilePreviewWindow } from "@/features/overlays/openers/filePreviewWindow";

export function CaptureThumb({
  fileId,
  alt,
  footer,
  className,
  aspectClassName = "aspect-[16/10]",
}: {
  fileId: string;
  alt: string;
  footer?: ReactNode;
  className?: string;
  aspectClassName?: string;
}) {
  const openFilePreview = useOpenFilePreviewWindow();
  return (
    <button
      type="button"
      onClick={() => openFilePreview({ fileId })}
      className={`group block w-full overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-primary/40 ${className ?? ""}`}
      aria-label={`Open ${alt} in the file viewer`}
      title="Open in file viewer"
    >
      <div className={`relative ${aspectClassName} bg-muted/40`}>
        <InlineMediaRef
          ref={fileIdToMediaRef(fileId, "image/png")}
          size="fill"
          fit="contain"
          rounded="none"
          fallback="icon"
          errorFallback="icon"
          alt={alt}
          className="transition-transform duration-200 group-hover:scale-[1.01]"
        />
      </div>
      {footer}
    </button>
  );
}
