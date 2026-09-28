// components/official/MiddleTruncate.tsx
//
// ONE-LINE TEXT THAT KEEPS BOTH ENDS. CSS ellipsis eats the END of a name, so
// four scopes named "LCP Test Repositories lcp-2026-…" all read the same (the
// phone Context sheet, page-pass /notes 2026-09-28). This keeps the tail — the
// part that tells siblings apart — and lets only the middle give way:
// "LCP Test Rep…lcp-0917-b". Pure CSS at render (no measuring, no layout
// shift): the head truncates, the tail never shrinks. A name that fits shows
// whole. The full text is the title and, once, the screen-reader text.

import * as React from "react";
import { cn } from "@/lib/utils";

/** Characters kept at the end (at most half the text). */
const DEFAULT_TAIL = 10;

export function splitForMiddleTruncate(text: string, tail = DEFAULT_TAIL): { head: string; end: string } {
  const keep = Math.min(tail, Math.floor(text.length / 2));
  if (keep <= 0) return { head: text, end: "" };
  return { head: text.slice(0, text.length - keep), end: text.slice(text.length - keep) };
}

export function MiddleTruncate({
  text,
  tail = DEFAULT_TAIL,
  className,
}: {
  text: string;
  /** Characters kept at the end. Default 10. */
  tail?: number;
  className?: string;
}): React.ReactElement {
  const { head, end } = splitForMiddleTruncate(text, tail);
  return (
    <span className={cn("flex min-w-0 items-baseline", className)} title={text}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="min-w-0 truncate whitespace-pre">
        {head}
      </span>
      {end ? (
        <span aria-hidden className="shrink-0 whitespace-pre">
          {end}
        </span>
      ) : null}
    </span>
  );
}
