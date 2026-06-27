"use client";

// components/diff/adapters/InlineTextDiff.tsx
//
// A compact, self-sizing word/line-level text diff for embedding inside the
// STRUCTURED entity diff (agent versions, note fields, …). It runs the
// canonical text engine (`computeTextDiff`) so only the text that actually
// changed is highlighted — identical lines and identical words within a
// changed line render plain. This is the fix for the old structured text
// adapters, which tinted the ENTIRE old value red and ENTIRE new value green
// whenever a field differed at all (so unchanged text looked "updated").
//
// Unlike the full `text/TextDiff.tsx` container (toolbar + h-full flex sizing),
// this renderer has no chrome and grows to its content, so it slots cleanly
// into the structured grid rows.

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { computeTextDiff } from "../text/engine/computeTextDiff";
import type {
  DiffCell,
  TextDiffOptions,
  WordSegment,
} from "../text/engine/types";
import {
  GUTTER,
  INLINE_BG,
  splitSideTint,
  wordSegmentClass,
} from "../text/diffColors";

const BASE_OPTIONS: Omit<TextDiffOptions, "ignoreTrailingWhitespace"> = {
  wordLevel: true,
  granularity: "word",
};

function renderSegments(
  cell: DiffCell,
  side: "left" | "right",
): React.ReactNode {
  if (cell.content === null) return null;
  if (!cell.segments || cell.segments.length === 0) {
    return cell.content === "" ? "\u00A0" : cell.content;
  }
  const keep: WordSegment["type"] = side === "left" ? "removed" : "added";
  return cell.segments.map((seg, i) => {
    if (seg.type === "unchanged") return <span key={i}>{seg.value}</span>;
    if (seg.type !== keep) return null;
    return (
      <span key={i} className={cn("rounded-[2px]", wordSegmentClass(side))}>
        {seg.value}
      </span>
    );
  });
}

interface InlineTextDiffProps {
  original: string;
  modified: string;
  /** Side-by-side ("split") or unified ("inline"). Default "split". */
  view?: "split" | "inline";
  /**
   * Treat trailing-whitespace-only line differences as unchanged. Default
   * FALSE: a trailing-whitespace edit is a real edit and is shown (word-level),
   * never silently hidden. Surfaces with an explicit "ignore whitespace" toggle
   * pass `true`.
   */
  ignoreTrailingWhitespace?: boolean;
  className?: string;
}

/**
 * Compact word/line-level text diff for the structured diff grid. Highlights
 * only the lines/words that changed; identical content is rendered plainly.
 */
export function InlineTextDiff({
  original,
  modified,
  view = "split",
  ignoreTrailingWhitespace = false,
  className,
}: InlineTextDiffProps) {
  const result = useMemo(
    () =>
      computeTextDiff(original, modified, {
        ...BASE_OPTIONS,
        ignoreTrailingWhitespace,
      }),
    [original, modified, ignoreTrailingWhitespace],
  );

  // No real change (or whitespace-only): render the new text plainly so the
  // viewer never claims unchanged text was modified.
  if (!result.hasChanges) {
    return (
      <div
        className={cn(
          "px-3 py-2 text-xs whitespace-pre-wrap break-words text-foreground/80",
          className,
        )}
      >
        {modified === "" ? "—" : modified}
      </div>
    );
  }

  if (view === "inline") {
    return (
      <div className={cn("text-xs font-mono leading-relaxed", className)}>
        {result.inline.map((line, i) => (
          <div
            key={i}
            className={cn("flex items-start px-2", INLINE_BG[line.type])}
          >
            <span
              className={cn(
                "select-none shrink-0 w-4 text-center",
                line.type === "added" && GUTTER.added,
                line.type === "removed" && GUTTER.removed,
                line.type === "unchanged" && "text-transparent",
              )}
            >
              {line.type === "added"
                ? "+"
                : line.type === "removed"
                  ? "-"
                  : " "}
            </span>
            <span className="flex-1 pr-3 whitespace-pre-wrap break-words">
              {renderSegments(
                {
                  lineNumber: null,
                  content: line.content,
                  segments: line.segments,
                },
                line.type === "added" ? "right" : "left",
              )}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <table className={cn("w-full border-collapse text-xs", className)}>
      <tbody>
        {result.rows.map((row, i) => (
          <tr key={i}>
            <td
              className={cn(
                "align-top px-3 py-0.5 border-r border-border w-1/2 whitespace-pre-wrap break-words",
                splitSideTint(row.type, "left", row.left.content === null),
              )}
            >
              {renderSegments(row.left, "left")}
            </td>
            <td
              className={cn(
                "align-top px-3 py-0.5 w-1/2 whitespace-pre-wrap break-words",
                splitSideTint(row.type, "right", row.right.content === null),
              )}
            >
              {renderSegments(row.right, "right")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
