"use client";

/**
 * PdfLoadingState — THE loading visual for every PDF surface.
 *
 * Fills the ENTIRE preview area (no tiny box in a sea of white). A large
 * document-page skeleton with a smooth diagonal shimmer sweep, animated
 * text lines, a neutral PDF mark, the filename, and a real progress bar
 * when byte counts are known. Built to read as "a high-end app is
 * preparing your document", on par with Drive / Dropbox / Box.
 */

import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PdfLoadingStateProps {
  fileName?: string | null;
  /** Bytes downloaded so far (real download progress). */
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

  // Varied skeleton line widths so the "text" reads as real paragraphs.
  const lines = [
    "92%", "78%", "96%", "64%", "88%", "73%", "97%", "59%",
    "84%", "69%", "94%", "47%",
  ];

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-muted/30 to-muted/10 p-6",
        className,
      )}
      role="status"
      aria-label={fileName ? `Loading ${fileName}` : "Loading PDF"}
    >
      {/* The page — fills the available space (capped to a pleasant max),
        * with a soft float-in and a diagonal shimmer sweep. */}
      <div className="relative flex min-h-0 w-full flex-1 items-center justify-center">
        <div
          className="relative aspect-[8.5/11] h-full max-h-full w-auto max-w-full animate-[pdf-float_4s_ease-in-out_infinite] overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_8px_40px_-12px_rgba(0,0,0,0.25)]"
          style={{ maxHeight: "min(100%, 520px)" }}
        >
          {/* Diagonal shimmer sweep */}
          <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[pdf-sweep_2s_cubic-bezier(0.4,0,0.2,1)_infinite] bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent" />

          {/* Skeleton content */}
          <div className="flex h-full flex-col gap-3 p-[7%]">
            {/* Heading block */}
            <div className="mb-2 h-[5%] w-2/5 rounded-md bg-muted" />
            {/* Paragraph lines */}
            {lines.map((w, i) => (
              <div
                key={i}
                className="h-[2.4%] rounded bg-muted/70"
                style={{
                  width: w,
                  animation: `pdf-linepulse 1.8s ease-in-out ${i * 0.12}s infinite`,
                }}
              />
            ))}
            {/* A "figure" block near the bottom */}
            <div className="mt-auto h-[22%] w-full rounded-lg bg-muted/40" />
          </div>

          {/* PDF mark — neutral, bottom-right, like a document badge */}
          <div className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-md border border-border/60 bg-background/80 px-2 py-1 backdrop-blur">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] font-semibold tracking-wider text-muted-foreground">
              PDF
            </span>
          </div>
        </div>
      </div>

      {/* Status row + progress — fixed-width, centered under the page */}
      <div className="mt-5 flex w-full max-w-md shrink-0 flex-col items-center gap-2">
        {fileName ? (
          <p className="max-w-full truncate text-sm font-medium text-foreground">
            {fileName}
          </p>
        ) : null}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/80">
          {pct !== null ? (
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          ) : (
            <div className="h-full w-1/3 animate-[pdf-indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-primary" />
          )}
        </div>
        <p className="text-xs tabular-nums text-muted-foreground">
          {pct !== null
            ? `${formatBytes(bytesLoaded)} of ${formatBytes(bytesTotal ?? 0)} · ${pct}%`
            : bytesLoaded > 0
              ? `${formatBytes(bytesLoaded)} loaded…`
              : "Preparing document…"}
        </p>
      </div>

      <style jsx global>{`
        @keyframes pdf-sweep {
          0% {
            transform: translateX(-100%) skewX(-12deg);
          }
          100% {
            transform: translateX(250%) skewX(-12deg);
          }
        }
        @keyframes pdf-float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-6px);
          }
        }
        @keyframes pdf-linepulse {
          0%,
          100% {
            opacity: 0.55;
          }
          50% {
            opacity: 1;
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
