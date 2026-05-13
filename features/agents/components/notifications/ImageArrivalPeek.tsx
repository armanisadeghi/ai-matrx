/**
 * features/agents/components/notifications/ImageArrivalPeek.tsx
 *
 * A small toast-style peek card that slides in from the bottom-right
 * whenever a new AI image arrives.
 *
 * Behaviour:
 *  - Auto-dismisses after `autoHideMs` (default 5 s).
 *  - Hovering freezes the timer — the card stays until the user moves away,
 *    then the remaining time resumes.
 *  - Clicking the X or the thumbnail dismisses immediately.
 *  - The image is NOT downloaded twice: the browser cache deduplicates the
 *    request because `ImageOutputBlock` (inline) and this card both render
 *    the same URL string. The universal handler's expiry-wheel ensures
 *    any signed-URL refresh is also coalesced across components.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, ImageIcon, Maximize2, Loader2 } from "lucide-react";
import { useFileAs } from "@/features/file-handler/hooks/useFileAs";
import type { FileSource } from "@/features/file-handler/types";

// Extract the cloud_files UUID from an S3 path:
//   /{userId}/{folder}/{uuid}.{ext}
// AI-generated images are registered in cloud_files at upload time, so we
// route through the handler (which auto-refreshes signed URLs via the
// expiry-wheel). When the URL isn't a recognisable cloud-file shape we
// fall back to using it directly as the <img src>.
function fileSourceFromS3Url(url: string): FileSource | null {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    const uuid = last.replace(/\.[^.]+$/, "");
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRe.test(uuid) ? { kind: "file_id", fileId: uuid } : null;
  } catch {
    return null;
  }
}

export interface ImageArrivalPeekProps {
  /** `${requestId}:${blockId}` — globally unique across all requests. */
  peekId: string;
  /** The presigned URL from the stream chunk. */
  url: string;
  mimeType?: string;
  /** Called when the card finishes its exit animation. */
  onDismiss: (peekId: string) => void;
  /**
   * Called when the user clicks the image thumbnail.
   * Opens the full-screen ImageViewerWindow for this image.
   */
  onImageClick: (url: string) => void;
  /** How long (ms) before auto-dismiss. Default: 5000. */
  autoHideMs?: number;
}

export function ImageArrivalPeek({
  peekId,
  url: initialUrl,
  mimeType,
  onDismiss,
  onImageClick,
  autoHideMs = 5_000,
}: ImageArrivalPeekProps) {
  // Route the AI-generated S3 URL through the universal handler so the
  // signed URL auto-refreshes via the expiry-wheel. The handler picks the
  // right URL flavour (CDN for public, signed for private). If the input
  // URL doesn't carry a cloud-file UUID we render it directly.
  const source = fileSourceFromS3Url(initialUrl);
  const { result, status } = useFileAs(source, { kind: "html_src" });
  const url = result ?? initialUrl;
  const loading = status === "resolving";

  const [visible, setVisible] = useState(true);

  // Timer management — pause on hover, resume on leave
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef(autoHideMs);
  const startedAtRef = useRef<number>(Date.now());

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startTimer = useCallback(
    (ms: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      startedAtRef.current = Date.now();
      timerRef.current = setTimeout(dismiss, ms);
    },
    [dismiss],
  );

  const pauseTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    remainingRef.current -= Date.now() - startedAtRef.current;
    if (remainingRef.current < 0) remainingRef.current = 0;
  }, []);

  const resumeTimer = useCallback(() => {
    if (remainingRef.current > 0) startTimer(remainingRef.current);
    else dismiss();
  }, [startTimer, dismiss]);

  // Start the auto-dismiss countdown on mount
  useEffect(() => {
    startTimer(autoHideMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [autoHideMs, startTimer]);

  return (
    <AnimatePresence onExitComplete={() => onDismiss(peekId)}>
      {visible && (
        <motion.div
          key={peekId}
          initial={{ opacity: 0, x: 40, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 40, scale: 0.94 }}
          transition={{ type: "spring", stiffness: 340, damping: 30 }}
          className="relative w-56 rounded-xl border bg-card shadow-lg overflow-hidden"
          onMouseEnter={pauseTimer}
          onMouseLeave={resumeTimer}
        >
          {/* Auto-dismiss progress bar */}
          <ProgressBar durationMs={autoHideMs} paused={false} />

          {/* Header row */}
          <div className="flex items-center gap-1.5 px-2.5 pt-2 pb-1">
            <ImageIcon className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span className="text-xs font-medium text-foreground flex-1 leading-none">
              New image
            </span>
            {mimeType && (
              <span className="text-[10px] font-mono text-muted-foreground">
                {mimeType.split("/")[1]}
              </span>
            )}
            <button
              onClick={dismiss}
              className="ml-auto p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          {/* Thumbnail — click opens the full ImageViewerWindow */}
          <div
            className="relative mx-2 mb-2 rounded-lg overflow-hidden bg-muted/40 cursor-pointer group"
            style={{ height: 110 }}
            onClick={() => {
              dismiss();
              onImageClick(url);
            }}
          >
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="AI image output"
                  className="w-full h-full object-cover"
                />
                {/* Hover overlay hint */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                  <Maximize2 className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Progress bar ──────────────────────────────────────────────────────────────

/**
 * A thin shrinking bar at the top of the card showing time remaining.
 * Uses a CSS animation so it never triggers React re-renders.
 */
function ProgressBar({
  durationMs,
  paused,
}: {
  durationMs: number;
  paused: boolean;
}) {
  return (
    <div className="absolute top-0 left-0 right-0 h-0.5 bg-muted overflow-hidden">
      <div
        className="h-full bg-primary origin-left"
        style={{
          animation: `shrink ${durationMs}ms linear forwards`,
          animationPlayState: paused ? "paused" : "running",
        }}
      />
      <style>{`
        @keyframes shrink {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>
    </div>
  );
}
