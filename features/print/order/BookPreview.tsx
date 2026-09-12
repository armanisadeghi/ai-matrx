"use client";

/**
 * The book, drawn to the trim size the user actually picked.
 *
 * This is the stage the whole right rail is built around — a large tinted
 * panel with the book standing in it, the way a product configurator shows
 * you the thing you are buying.
 *
 * It is an ILLUSTRATION, not a measurement: the cover is drawn at the real
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
  return !id.includes("saddle");
}

export function BookPreview({
  trim,
  binding,
  pageCount,
  coverFinishId,
  className,
}: BookPreviewProps) {
  if (!trim) {
    return (
      <div
        className={cn(
          "flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-gradient-to-br from-muted/50 to-muted text-center",
          className,
        )}
      >
        <BookOpen className="size-9 text-muted-foreground/50" />
        <p className="max-w-[15rem] px-4 text-sm text-muted-foreground">
          Pick a size and your book appears here, drawn to scale.
        </p>
      </div>
    );
  }

  const ratio =
    trim.widthIn && trim.heightIn ? trim.widthIn / trim.heightIn : 0.72;

  // The stage is a fixed 200×150 box; the cover is sized inside it so a
  // Pocketbook really does render smaller than US Letter.
  const STAGE_W = 200;
  const STAGE_H = 150;
  const maxHeight = 108;
  const coverHeight = maxHeight;
  const coverWidth = coverHeight * ratio;

  const spine = hasVisibleSpine(binding)
    ? Math.min(22, Math.max(2.5, (pageCount ?? 0) / 30))
    : 2;

  const hardcover = binding?.group === "hardcover";
  const coil = (binding?.id ?? "").toLowerCase().includes("coil");
  const wire = (binding?.id ?? "").toLowerCase().includes("wire");
  const glossy = (coverFinishId ?? "").toLowerCase().startsWith("gloss");

  // Centre the whole object (spine + cover) on the stage.
  const totalWidth = spine + coverWidth;
  const left = (STAGE_W - totalWidth) / 2;
  const top = (STAGE_H - coverHeight) / 2 - 4;

  return (
    <div
      className={cn(
        "aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-secondary/10 to-secondary/20",
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
        className="h-full w-full"
        role="img"
        aria-label={`${trim.label}${pageCount ? `, ${pageCount} pages` : ""}${
          binding ? `, ${binding.label}` : ""
        }`}
      >
        <defs>
          <linearGradient id="preview-cover" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.95" />
            <stop offset="100%" stopColor="hsl(var(--secondary))" stopOpacity="0.92" />
          </linearGradient>
          <linearGradient id="preview-spine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(var(--secondary))" stopOpacity="0.6" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id="preview-sheen" x1="0" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity={glossy ? 0.5 : 0.16} />
            <stop offset={glossy ? "38%" : "62%"} stopColor="white" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="preview-pages" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.95" />
            <stop offset="100%" stopColor="white" stopOpacity="0.7" />
          </linearGradient>
        </defs>

        {/* Contact shadow — the book stands on something. */}
        <ellipse
          cx={left + totalWidth / 2}
          cy={top + coverHeight + 7}
          rx={coverWidth * 0.62}
          ry="5"
          fill="hsl(var(--foreground))"
          opacity="0.16"
        />

        {/* Page block behind the cover. */}
        <rect
          x={left + spine}
          y={top + 2}
          width={coverWidth}
          height={coverHeight - 3}
          rx="1.5"
          fill="url(#preview-pages)"
        />

        {/* Spine plane. */}
        <path
          d={`M${left} ${top + spine} L${left + spine} ${top} L${left + spine} ${top + coverHeight} L${left} ${top + coverHeight + spine} Z`}
          fill="url(#preview-spine)"
        />

        {/* Front cover — hardcovers overhang the block. */}
        <rect
          x={left + spine}
          y={hardcover ? top - 2.5 : top}
          width={coverWidth}
          height={hardcover ? coverHeight + 5 : coverHeight}
          rx={hardcover ? 3 : 1.5}
          fill="url(#preview-cover)"
        />
        <rect
          x={left + spine}
          y={hardcover ? top - 2.5 : top}
          width={coverWidth}
          height={hardcover ? coverHeight + 5 : coverHeight}
          rx={hardcover ? 3 : 1.5}
          fill="url(#preview-sheen)"
        />

        {/* Linen wrap earns its foil rule; case wrap a printed band. */}
        {hardcover ? (
          <rect
            x={left + spine + coverWidth * 0.16}
            y={top + coverHeight * 0.36}
            width={coverWidth * 0.68}
            height="2"
            rx="1"
            fill={
              (binding?.id ?? "").toLowerCase().includes("linen")
                ? "#f5d78a"
                : "white"
            }
            opacity={
              (binding?.id ?? "").toLowerCase().includes("linen") ? 0.95 : 0.7
            }
          />
        ) : null}

        {/* Coil / Wire-O bind through the spine edge. */}
        {coil
          ? Array.from({ length: 9 }).map((_, i) => (
              <circle
                key={i}
                cx={left + spine + 5}
                cy={top + 8 + i * ((coverHeight - 16) / 8)}
                r="2.2"
                fill="none"
                stroke="white"
                strokeWidth="1.4"
                opacity="0.75"
              />
            ))
          : null}
        {wire
          ? Array.from({ length: 11 }).map((_, i) => (
              <rect
                key={i}
                x={left + spine + 2.5}
                y={top + 7 + i * ((coverHeight - 14) / 10)}
                width="6"
                height="1.8"
                rx="0.9"
                fill="white"
                opacity="0.7"
              />
            ))
          : null}
      </svg>
    </div>
  );
}
