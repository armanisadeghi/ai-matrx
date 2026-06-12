"use client";

/**
 * PdfLoadingState — THE loading visual for every PDF surface.
 *
 * Fills the entire preview area (no more tiny box floating in white
 * space): a soft page-skeleton with shimmering text lines, a PDF mark,
 * the filename, and a real progress bar when byte counts are known.
 * Enterprise-clean: semantic tokens, Lucide only, subtle motion.
 */

import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PdfLoadingStateProps {
  fileName?: string | null;
  /** Bytes downloaded so far (progressive range loading). */
  bytesLoaded?: number;
  /** Total bytes when known — enables the determinate progress bar. */
  bytesTotal?: number | null;
  className?: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function PdfLoadingState({
  fileName,
  bytesLoaded = 0,
  bytesTotal,
  className,
}: PdfLoadingStateProps) {
  const pct =
    bytesTotal && bytesTotal > 0
      ? Math.min(100, Math.round((bytesLoaded / bytesTotal) * 100))
      : null;

  return (
    <div
      className={cn(
        "flex h-full min-h-[320px] w-full flex-col items-center justify-center gap-6 bg-muted/20 p-8",
        className,
      )}
      role="status"
      aria-label={fileName ? `Loading ${fileName}` : "Loading PDF"}
    >
      {/* Page skeleton — a document silhouette that reads instantly as
        * "a PDF is on its way", scaled to the available area. */}
      <div className="relative w-full max-w-sm flex-1 min-h-0 max-h-[480px]">
        <div className="absolute inset-0 mx-auto aspect-[8.5/11] max-h-full rounded-lg border border-border bg-card shadow-sm overflow-hidden">
          {/* Shimmer wash */}
          <div className="absolute inset-0 -translate-x-full animate-[pdf-shimmer_1.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-foreground/[0.04] to-transparent" />
          {/* Skeleton text lines */}
          <div className="flex h-full flex-col gap-3 p-6 pt-8">
            <div className="h-4 w-3/5 rounded bg-muted" />
            <div className="h-2.5 w-full rounded bg-muted/70" />
            <div className="h-2.5 w-11/12 rounded bg-muted/70" />
            <div className="h-2.5 w-full rounded bg-muted/70" />
            <div className="h-2.5 w-4/5 rounded bg-muted/70" />
            <div className="mt-3 h-2.5 w-full rounded bg-muted/60" />
            <div className="h-2.5 w-10/12 rounded bg-muted/60" />
            <div className="h-2.5 w-full rounded bg-muted/60" />
            <div className="mt-auto h-24 w-full rounded bg-muted/40" />
          </div>
          {/* PDF mark — bottom-right of the page, like a doc badge */}
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1">
            <FileText className="h-3.5 w-3.5 text-destructive" />
            <span className="text-[10px] font-bold tracking-wider text-destructive">
              PDF
            </span>
          </div>
        </div>
      </div>

      {/* Status line + progress */}
      <div className="flex w-full max-w-sm flex-col items-center gap-2">
        {fileName ? (
          <p className="max-w-full truncate text-sm font-medium text-foreground">
            {fileName}
          </p>
        ) : null}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          {pct !== null ? (
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          ) : (
            <div className="h-full w-1/3 animate-[pdf-indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-primary" />
          )}
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {pct !== null
            ? `${formatBytes(bytesLoaded)} of ${formatBytes(bytesTotal ?? 0)} · ${pct}%`
            : bytesLoaded > 0
              ? `${formatBytes(bytesLoaded)} loaded…`
              : "Preparing document…"}
        </p>
      </div>

      <style jsx global>{`
        @keyframes pdf-shimmer {
          100% {
            transform: translateX(200%);
          }
        }
        @keyframes pdf-indeterminate {
          0% {
            transform: translateX(-120%);
          }
          100% {
            transform: translateX(420%);
          }
        }
      `}</style>
    </div>
  );
}
