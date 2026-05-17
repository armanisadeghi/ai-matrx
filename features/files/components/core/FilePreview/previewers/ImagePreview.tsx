/**
 * features/files/components/core/FilePreview/previewers/ImagePreview.tsx
 *
 * Image previewer. When mounted inside `SingleFileShell`'s
 * `FileViewerControlsProvider`, reads zoom / rotation / fit / transparency-
 * grid from the context (driven by `ImagePreviewControls` in the rail).
 * When standalone (compact PreviewPane), falls back to the historical
 * static `<img>` so nothing visible changes for side-panel users.
 *
 * Pan: when zoomed beyond fit, the wrapper switches to native overflow
 * scrolling — drag with two fingers / scroll wheel works out of the box.
 * Click-and-drag pan is intentionally out of scope for this pass (adds
 * pointer-state + non-trivial momentum work) and can ship as a follow-up.
 */

"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFileViewerControls } from "@/features/files/components/surfaces/FileViewerControlsContext";

export interface ImagePreviewProps {
  url: string | null;
  fileName: string;
  className?: string;
}

// Subtle checkered background. Two layered conic-gradients give us a
// transparency grid without an image asset. Sized in CSS pixels so the
// pattern stays visible regardless of zoom.
const TRANSPARENCY_GRID_STYLE: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, rgb(0 0 0 / 0.08) 25%, transparent 25%), " +
    "linear-gradient(-45deg, rgb(0 0 0 / 0.08) 25%, transparent 25%), " +
    "linear-gradient(45deg, transparent 75%, rgb(0 0 0 / 0.08) 75%), " +
    "linear-gradient(-45deg, transparent 75%, rgb(0 0 0 / 0.08) 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
};

export function ImagePreview({ url, fileName, className }: ImagePreviewProps) {
  const controls = useFileViewerControls();
  const [errored, setErrored] = useState(false);

  if (!url) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-muted/30",
          className,
        )}
      >
        <div className="h-10 w-10 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (errored) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/30 text-muted-foreground",
          className,
        )}
      >
        <AlertCircle className="h-6 w-6" />
        <span className="text-xs">Preview unavailable.</span>
      </div>
    );
  }

  // No controls provider → keep the historical behavior exactly: a fit-to-
  // container `<img>` on a muted background. Side panel users get nothing
  // new, so no regression risk.
  if (!controls) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center overflow-hidden bg-muted/20",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={fileName}
          className="max-h-full max-w-full object-contain"
          onError={() => setErrored(true)}
        />
      </div>
    );
  }

  const { imageZoom, imageRotation, imageFit, imageTransparencyGrid } =
    controls;

  // In fit mode the image scales to its container; rotation is a CSS
  // transform on the inner img. In actual mode the image renders at its
  // intrinsic size × zoom, and the wrapper handles overflow scrolling so
  // the user can pan with wheel / two-finger / drag-with-trackpad gestures.
  const isFit = imageFit === "fit";
  const imgStyle: React.CSSProperties = isFit
    ? {
        transform: `rotate(${imageRotation}deg)`,
        // Rotation in 90° increments can change which dimension is the
        // "long" one. Swapping max-* via inline style keeps the image fit
        // to the container's smaller axis instead of overflowing.
        maxHeight: imageRotation % 180 === 0 ? "100%" : "100vmin",
        maxWidth: imageRotation % 180 === 0 ? "100%" : "100vmin",
      }
    : {
        transform: `scale(${imageZoom}) rotate(${imageRotation}deg)`,
        transformOrigin: "center center",
      };

  return (
    <div
      className={cn(
        "h-full w-full",
        // In fit mode: center the image; no scrolling.
        // In actual mode: enable scrolling so zoom > 1 reveals the full image.
        isFit
          ? "flex items-center justify-center overflow-hidden"
          : "overflow-auto",
        imageTransparencyGrid ? "bg-background" : "bg-muted/20",
        className,
      )}
      style={imageTransparencyGrid ? TRANSPARENCY_GRID_STYLE : undefined}
    >
      <div
        className={cn(
          // In actual mode, give a generous min size so the image can be
          // scrolled past its edges — feels like Preview.app on macOS.
          isFit
            ? "flex items-center justify-center"
            : "min-h-full min-w-full flex items-center justify-center p-8",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={fileName}
          draggable={false}
          className={cn("select-none", isFit ? "object-contain" : "")}
          style={imgStyle}
          onError={() => setErrored(true)}
        />
      </div>
    </div>
  );
}

export default ImagePreview;
