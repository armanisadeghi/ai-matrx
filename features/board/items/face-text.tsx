"use client";

/**
 * What a text-bearing tile (a chat, a write-up) shows on its far-zoom card: a compact icon + one line when it
 * is empty, or the line of text it holds. Sizes are SCREEN pixels (the board's zoom divided back out), capped by
 * the card, so the line stays readable at 15-27% and never overflows.
 */

import type { LucideIcon } from "lucide-react";

export const FACE_LINE = "min(calc(13px / var(--board-z, 1)), 11cqw, 14cqh)";

export function FaceLine({ icon: Icon, text, muted = false, lines = 4 }: { icon: LucideIcon; text: string; muted?: boolean; lines?: number }) {
  return (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-[4%] overflow-hidden px-[8%] text-center">
      <Icon className="shrink-0 text-muted-foreground" style={{ width: FACE_LINE, height: FACE_LINE }} aria-hidden />
      <span
        className={muted ? "min-w-0 font-medium leading-snug text-muted-foreground" : "min-w-0 font-medium leading-snug text-foreground/85"}
        style={{ fontSize: FACE_LINE, display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines, overflow: "hidden" }}
      >
        {text}
      </span>
    </span>
  );
}

/** The first readable words of markdown: headings, list marks, emphasis and links removed. */
export function plainExcerpt(markdown: string, max = 160): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[#>\-*\d.\s]+/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}
