"use client";

/**
 * The book, drawn to the trim size the user actually picked.
 *
 * This is an ILLUSTRATION, not a measurement: the cover is drawn at the real
 * trim aspect ratio from the catalog, and the spine thickens with page count
 * so a 40-page saddle-stitch and an 800-page hardcover do not look identical.
 * Exact spine widths come from `POST /lulu/cover-dimensions` — never from
 * anything drawn here.
 */

import { BookOpen } from "lucide-react";
import { cn } from "@/utils/cn";
import type { LuluBindingOption, LuluTrimOption } from "./types";

interface BookPreviewProps {
  trim: LuluTrimOption | null;
  binding: LuluBindingOption | null;
  pageCount: number | null;
  /** Cover finish id — gloss gets a stronger sheen than matte. */
  coverFinishId: string | null;
  className?: string;
}

/** A flat-bound book shows no spine face at this angle. */
function hasVisibleSpine(binding: LuluBindingOption | null): boolean {
  if (!binding) return true;
  const id = binding.id.toLowerCase();
  return !id.includes("saddle") && !id.includes("coil") && !id.includes("wire");
}

export function BookPreview({
  trim,
  binding,
  pageCount,
  coverFinishId,
  className,
}: BookPreviewProps) {
  const ratio =
    trim && trim.widthIn && trim.heightIn ? trim.widthIn / trim.heightIn : 0.72;

  // Fit the cover inside a fixed box so every trim is drawn to the same scale
  // relative to its neighbours — a Pocketbook really does look smaller than
  // US Letter, which is the whole point of showing this.
  const BOX = 128;
  const coverHeight = BOX;
  const coverWidth = Math.round(BOX * ratio);

  // Spine grows with pages, clamped so the drawing stays a book, not a brick.
  const spine = hasVisibleSpine(binding)
    ? Math.min(26, Math.max(3, Math.round((pageCount ?? 0) / 26)))
    : 3;

  const hardcover = binding?.group === "hardcover";
  const glossy = (coverFinishId ?? "").toLowerCase().startsWith("gloss");

  const width = coverWidth + spine + 14;
  const height = coverHeight + 20;

  if (!trim) {
    return (
      <div
        className={cn(
          "flex h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 text-center",
          className,
        )}
      >
        <BookOpen className="size-7 text-muted-foreground/60" />
        <p className="max-w-[14rem] text-xs text-muted-foreground">
          Pick a size and your book appears here, drawn to scale.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-44 items-center justify-center rounded-xl border border-border bg-muted/30",
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`${trim.label}${pageCount ? `, ${pageCount} pages` : ""}`}
        className="overflow-visible"
      >
        <defs>
          <linearGradient id="lulu-cover-face" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.95" />
            <stop offset="100%" stopColor="hsl(var(--secondary))" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="lulu-cover-spine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(var(--secondary))" stopOpacity="0.55" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.8" />
          </linearGradient>
          <linearGradient id="lulu-cover-sheen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity={glossy ? 0.42 : 0.14} />
            <stop offset="55%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Ground shadow keeps the book from floating. */}
        <ellipse
          cx={spine + coverWidth / 2 + 6}
          cy={height - 5}
          rx={coverWidth / 2}
          ry="3.5"
          fill="hsl(var(--foreground))"
          opacity="0.12"
        />

        {/* Page block — the stack you see under the cover. */}
        <rect
          x={spine + 3}
          y="9"
          width={coverWidth}
          height={coverHeight - 4}
          rx={hardcover ? 3 : 2}
          fill="hsl(var(--card))"
          stroke="hsl(var(--border))"
          strokeWidth="1"
        />

        {/* Spine face. */}
        <path
          d={`M6 ${8 + spine} L${6 + spine} 8 L${6 + spine} ${8 + coverHeight} L6 ${8 + coverHeight + spine} Z`}
          fill="url(#lulu-cover-spine)"
        />

        {/* Front cover. */}
        <rect
          x={6 + spine}
          y="8"
          width={coverWidth}
          height={coverHeight}
          rx={hardcover ? 3 : 1.5}
          fill="url(#lulu-cover-face)"
        />
        <rect
          x={6 + spine}
          y="8"
          width={coverWidth}
          height={coverHeight}
          rx={hardcover ? 3 : 1.5}
          fill="url(#lulu-cover-sheen)"
        />

        {/* Linen wrap gets its foil-stamp rule; case wrap gets a printed band. */}
        {hardcover ? (
          <rect
            x={6 + spine + coverWidth * 0.14}
            y={8 + coverHeight * 0.34}
            width={coverWidth * 0.72}
            height="1.5"
            fill="white"
            opacity="0.75"
          />
        ) : null}

        {/* Coil / wire binding reads as its holes, not a spine. */}
        {!hasVisibleSpine(binding) && binding?.id.toLowerCase().includes("coil")
          ? Array.from({ length: 7 }).map((_, index) => (
              <circle
                key={index}
                cx={6 + spine + 5}
                cy={18 + index * ((coverHeight - 20) / 6)}
                r="1.8"
                fill="hsl(var(--card))"
                opacity="0.85"
              />
            ))
          : null}
      </svg>
    </div>
  );
}
