/**
 * features/file-analysis/components/BboxPreview.tsx
 *
 * Renders the cropped server-side PNG returned by /annotations/extract-at-bbox
 * (base64). When no preview is available yet (still loading or the caller
 * opted out), shows a small skeleton. Tiny + reusable from the label picker,
 * region-extract dialog, etc.
 */

"use client";

import { cn } from "@/lib/utils";

interface BboxPreviewProps {
  pngBase64?: string | null;
  altText?: string;
  className?: string;
}

export function BboxPreview({
  pngBase64,
  altText = "Region preview",
  className,
}: BboxPreviewProps) {
  if (!pngBase64) {
    return (
      <div
        className={cn(
          "flex h-20 w-full items-center justify-center rounded border border-dashed border-border bg-muted/40 text-[10px] text-muted-foreground",
          className,
        )}
      >
        no preview
      </div>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={`data:image/png;base64,${pngBase64}`}
      alt={altText}
      className={cn(
        "block max-h-32 max-w-full rounded border border-border bg-white object-contain",
        className,
      )}
    />
  );
}
