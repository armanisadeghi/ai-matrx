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
 *  - The thumbnail itself is rendered by `UnifiedImageBlockRenderer` in
 *    its `compact` variant — same component that renders the inline image
 *    in the message body. The handler's lazy URL cache shares one signed
 *    URL across both surfaces, and the browser cache dedupes the actual
 *    HTTP fetch.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, ImageIcon } from "lucide-react";
import { UnifiedImageBlockRenderer } from "@/features/files/blocks/image/UnifiedImageBlockRenderer";
import type { UnifiedImageBlock } from "@/features/files/blocks/image/types";

export interface ImageArrivalPeekProps {
  /** `${requestId}:${blockId}` — globally unique across all requests. */
  peekId: string;
  /** Canonical image block — same shape the inline message renderer reads. */
  block: UnifiedImageBlock;
  /** Called when the card finishes its exit animation. */
  onDismiss: (peekId: string) => void;
  /**
   * Called when the user clicks the image thumbnail with the resolved
   * `src`. Opens the full-screen ImageViewerWindow.
   */
  onImageClick: (src: string) => void;
  /** How long (ms) before auto-dismiss. Default: 5000. */
  autoHideMs?: number;
}

export function ImageArrivalPeek({
  peekId,
  block,
  onDismiss,
  onImageClick,
  autoHideMs = 5_000,
}: ImageArrivalPeekProps) {
  const [visible, setVisible] = useState(true);

  // Timer management — pause on hover, resume on leave
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef(autoHideMs);
  const startedAtRef = useRef<number>(Date.now());

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
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

  useEffect(() => {
    startTimer(autoHideMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [autoHideMs, startTimer]);

  const mimeLabel = block.mimeType?.split("/")[1] ?? null;

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
            {mimeLabel && (
              <span className="text-[10px] font-mono text-muted-foreground">
                {mimeLabel}
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
            className="relative mx-2 mb-2 rounded-lg overflow-hidden bg-muted/40"
            style={{ height: 110 }}
          >
            <UnifiedImageBlockRenderer
              block={block}
              variant="compact"
              onCompactClick={(src) => {
                dismiss();
                onImageClick(src);
              }}
            />
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
