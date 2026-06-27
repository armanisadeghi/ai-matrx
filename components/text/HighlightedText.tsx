"use client";

/**
 * HighlightedText — generic "render a string with matched terms marked".
 *
 * The canonical primitive for painting search/find highlights into plain text
 * anywhere in the app (document viewers, search snippets, result rows). It
 * reuses the pure, tested match engine (`computeMatches`) so highlight
 * semantics (literal vs regex, case, whole-word) are identical to the notes
 * Find/Replace stack — there is exactly ONE matcher in the codebase.
 *
 * Two ways to drive it:
 *   - pass `query` and it computes matches itself (the common case), or
 *   - pass precomputed `matches` (when the caller already ran `computeMatches`
 *     for its own counting / active-match coordination and wants to avoid a
 *     second pass).
 *
 * It renders a fragment of text + `<mark>` spans — drop it anywhere inline,
 * inside a `<pre>`, a `<p>`, a table cell. Each mark carries
 * `data-match-index` so callers can query/scroll to a specific occurrence, and
 * the active match (for next/prev navigation) gets a distinct treatment plus an
 * optional ref for scroll-into-view.
 */

import React, { useMemo } from "react";
import {
  computeMatches,
  type FindMatch,
  type FindOptions,
} from "@/features/notes/utils/findMatches";
import { cn } from "@/lib/utils";

export interface HighlightedTextProps {
  /** The text to render. */
  text: string;
  /** The query to highlight. Ignored when `matches` is provided. */
  query?: string;
  /** Precomputed matches (absolute offsets into `text`). Overrides `query`. */
  matches?: FindMatch[];
  /** Match options. Defaults to literal, case-insensitive, not whole-word. */
  options?: Partial<FindOptions>;
  /** Index of the "active" match (for next/prev nav). -1 / undefined = none. */
  activeIndex?: number;
  /** Extra classes for every (non-active) mark. */
  markClassName?: string;
  /** Extra classes for the active mark. */
  activeMarkClassName?: string;
  /** Ref callback fired for the active mark element (e.g. to scrollIntoView). */
  activeMarkRef?: (el: HTMLElement | null) => void;
}

const DEFAULT_OPTIONS: FindOptions = {
  caseSensitive: false,
  useRegex: false,
  wholeWord: false,
};

/** Canonical highlight look — amber wash, readable in both themes. */
const BASE_MARK =
  "bg-amber-200/70 text-foreground dark:bg-amber-400/25 rounded-[2px] px-px";
const ACTIVE_MARK =
  "bg-amber-300 text-foreground dark:bg-amber-400/45 ring-1 ring-amber-500 ring-offset-0 rounded-[2px] px-px";

export function HighlightedText({
  text,
  query,
  matches,
  options,
  activeIndex = -1,
  markClassName,
  activeMarkClassName,
  activeMarkRef,
}: HighlightedTextProps) {
  const resolved = useMemo<FindMatch[]>(() => {
    if (matches) return matches;
    if (!query) return [];
    return computeMatches(text, query, { ...DEFAULT_OPTIONS, ...options });
  }, [text, query, matches, options]);

  const segments = useMemo(() => {
    if (resolved.length === 0) {
      return [{ kind: "text" as const, text }];
    }
    const out: Array<
      | { kind: "text"; text: string }
      | { kind: "mark"; text: string; matchIndex: number }
    > = [];
    let cursor = 0;
    for (let i = 0; i < resolved.length; i++) {
      const m = resolved[i];
      // Skip degenerate / overlapping ranges defensively.
      if (m.start < cursor || m.end <= m.start) continue;
      if (m.start > cursor) {
        out.push({ kind: "text", text: text.slice(cursor, m.start) });
      }
      out.push({
        kind: "mark",
        text: text.slice(m.start, m.end),
        matchIndex: i,
      });
      cursor = m.end;
    }
    if (cursor < text.length) {
      out.push({ kind: "text", text: text.slice(cursor) });
    }
    return out;
  }, [text, resolved]);

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === "text") {
          return <React.Fragment key={i}>{seg.text}</React.Fragment>;
        }
        const isActive = seg.matchIndex === activeIndex;
        return (
          <mark
            key={i}
            data-match-index={seg.matchIndex}
            ref={isActive ? activeMarkRef : undefined}
            className={cn(
              isActive ? ACTIVE_MARK : BASE_MARK,
              isActive ? activeMarkClassName : markClassName,
            )}
          >
            {seg.text}
          </mark>
        );
      })}
    </>
  );
}
