/**
 * features/agents/components/notifications/ImageArrivalPeekHost.tsx
 *
 * Overlay widget — registered as `overlayId: "imagePeekHost"` in the
 * window-panel registry.  The unified OverlayController loads this lazily
 * (dynamic import) so it never appears in the boot bundle.
 *
 * Lifecycle:
 *  - Opened automatically by process-stream.ts whenever an `image_output`
 *    block is stored in Redux (dispatch openOverlay({ overlayId: "imagePeekHost" })).
 *  - Renders a bottom-right stack of ImageArrivalPeek toast cards.
 *  - When all cards are dismissed it calls `onClose()`, which closes the
 *    overlay and lets the overlay chunk unload until the next image arrives.
 *  - Clicking a thumbnail calls `openImageViewer` to open the existing
 *    full-featured ImageViewerWindow in a floating panel.
 *
 * Props follow the OverlaySurface contract: `isOpen` + `onClose`.
 */

"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useImageArrivalPeeks } from "./useImageArrivalPeeks";
import { ImageArrivalPeek } from "./ImageArrivalPeek";
import { openImageViewer } from "@/features/window-panels/windows/image/openImageViewer";

// ─── Overlay contract props ────────────────────────────────────────────────────

interface ImageArrivalPeekHostProps {
  /** Provided by OverlaySurface; the host ignores it — it self-manages. */
  isOpen?: boolean;
  /** Provided by OverlaySurface; called to close this overlay when empty. */
  onClose?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ImageArrivalPeekHost({
  isOpen,
  onClose,
}: ImageArrivalPeekHostProps) {
  const dispatch = useAppDispatch();
  const { peeks, dismiss } = useImageArrivalPeeks();

  // Track whether we've shown at least one peek. On first mount peeks=[],
  // but we must not call onClose() until after the peek detection effect
  // has run and the queue has had a chance to fill.
  const hadPeeksRef = useRef(false);

  // Self-close when the peek queue drains after having shown at least one card.
  useEffect(() => {
    if (peeks.length > 0) {
      hadPeeksRef.current = true;
    } else if (hadPeeksRef.current && isOpen && onClose) {
      onClose();
    }
  }, [isOpen, peeks.length, onClose]);

  // Open the full-featured ImageViewerWindow when the user clicks a thumbnail.
  const handleImageClick = useCallback(
    (url: string) => {
      openImageViewer(dispatch, {
        images: [url],
        title: "AI Generated Image",
      });
    },
    [dispatch],
  );

  if (!isOpen || peeks.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[9800] flex flex-col-reverse gap-2 pointer-events-none"
      aria-live="polite"
      aria-label="New image notifications"
    >
      {peeks.map((peek) => (
        <div key={peek.peekId} className="pointer-events-auto">
          <ImageArrivalPeek
            peekId={peek.peekId}
            block={peek.block}
            onDismiss={dismiss}
            onImageClick={handleImageClick}
          />
        </div>
      ))}
    </div>
  );
}

export default ImageArrivalPeekHost;
