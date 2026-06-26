"use client";

// components/diff/text/TextDiff.tsx
//
// Headless LIGHT diff core for plain text / markdown. Pure presentation:
// no Redux, no overlay, no router. Renders the canonical text diff engine
// output as either an inline (unified) or split (side-by-side) view with
// optional word/char-level highlighting. Drop it into a route, window,
// modal, sheet, or any region of a page — it fills its container.

import { useMemo, useState } from "react";
import {
  Columns2,
  Rows3,
  WrapText,
  Hash,
  Highlighter,
  ArrowLeftRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { computeTextDiff, summarizeTextDiff } from "./engine/computeTextDiff";
import type {
  DiffCell,
  DiffRow,
  TextDiffOptions,
  WordSegment,
} from "./engine/types";

// "highlight" is the reader's view: a SINGLE-PANE rendering of the *new*
// document (the after) with only the added/changed regions tinted inline — no
// removed lines, no +/- gutter, no monospace. "inline" is the developer's
// unified diff (both sides stacked); "split" is side-by-side. The same one
// computation feeds all three.
export type TextDiffView = "inline" | "split" | "highlight";

export interface TextDiffProps {
  original: string;
  modified: string;
  originalLabel?: string;
  modifiedLabel?: string;
  /** Controlled view; if omitted the component manages its own. */
  view?: TextDiffView;
  defaultView?: TextDiffView;
  onViewChange?: (view: TextDiffView) => void;
  /** Show the built-in toolbar (view toggle, wrap, line numbers, stats). */
  showToolbar?: boolean;
  showLineNumbers?: boolean;
  /** Soft-wrap long lines instead of horizontal scroll. */
  wrap?: boolean;
  /** Engine options (word level, granularity, trailing-ws). */
  diffOptions?: TextDiffOptions;
  /** Optional extra controls rendered on the right side of the toolbar. */
  toolbarSlot?: React.ReactNode;
  className?: string;
}

// GitHub-style diff palette \u2014 the de-facto enterprise standard, legible in
// both light and dark. Three intensities per color, layered:
//   LINE_BG  \u2014 the whole changed line, the faintest tint.
//   WORD_BG  \u2014 the exact changed words, layered on top of LINE_BG so the edit
//              pops out of the line.
//   GUTTER   \u2014 the +/- markers and other foreground accents.
// Reds = removed (old-only), greens = added (new-only). Dark mode uses a bright
// hue at low opacity (green-500/15) rather than a near-black 950 shade, which
// is what made the previous scheme invisible.
const LINE_BG = {
  added: "bg-green-100 dark:bg-green-500/15",
  removed: "bg-red-100 dark:bg-red-500/15",
} as const;

const WORD_BG = {
  added: "bg-green-300 dark:bg-green-500/40",
  removed: "bg-red-300 dark:bg-red-500/40",
} as const;

const GUTTER = {
  added: "text-green-700 dark:text-green-400",
  removed: "text-red-700 dark:text-red-400",
} as const;

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
    if (seg.type === "unchanged") {
      return <span key={i}>{seg.value}</span>;
    }
    if (seg.type !== keep) return null;
    return (
      <span
        key={i}
        className={cn(
          "rounded-[2px]",
          side === "left" ? WORD_BG.removed : WORD_BG.added,
        )}
      >
        {seg.value}
      </span>
    );
  });
}

// Per-side tint for the split (side-by-side) view: the OLD column reads red on
// removed/modified rows, the NEW column reads green on added/modified rows \u2014
// the way every modern side-by-side diff works. Absent cells (a line that
// exists only on the other side) get a neutral fill so the gap is obvious.
function splitTint(row: DiffRow, side: "left" | "right"): string {
  const cell = side === "left" ? row.left : row.right;
  if (cell.content === null) return "bg-muted/40";
  if (side === "left" && (row.type === "removed" || row.type === "modified"))
    return LINE_BG.removed;
  if (side === "right" && (row.type === "added" || row.type === "modified"))
    return LINE_BG.added;
  return "";
}

// Tint for the inline (unified) view, keyed by the line's own type. Inline
// never emits "modified" \u2014 a change becomes a removed line then an added line.
const INLINE_BG = {
  added: LINE_BG.added,
  removed: LINE_BG.removed,
  unchanged: "",
} as const;

/**
 * Render one new-side line for the single-pane "highlight" view: the document
 * as it now reads, with only the new/changed text tinted. A modified line
 * carries word-level `segments` (we keep `added` + `unchanged`, drop the old
 * `removed` words); a pure-added line has no segments, so the whole line is
 * tinted. Unchanged lines render plain. Blank lines collapse to a non-breaking
 * space so they keep their height.
 */
function renderHighlightLine(
  content: string,
  type: "added" | "unchanged",
  segments: WordSegment[] | undefined,
): React.ReactNode {
  if (type === "unchanged") {
    return content === "" ? " " : content;
  }
  if (!segments || segments.length === 0) {
    return (
      <span className="rounded-[2px] bg-green-100 dark:bg-green-500/15">
        {content === "" ? " " : content}
      </span>
    );
  }
  return segments.map((seg, i) => {
    if (seg.type === "removed") return null;
    if (seg.type === "unchanged") return <span key={i}>{seg.value}</span>;
    return (
      <span key={i} className={cn("rounded-[2px]", WORD_BG.added)}>
        {seg.value}
      </span>
    );
  });
}

function LineNumber({ n, show }: { n: number | null; show: boolean }) {
  if (!show) return null;
  return (
    <span className="select-none shrink-0 w-10 pr-2 text-right text-muted-foreground/60 tabular-nums">
      {n ?? ""}
    </span>
  );
}

export function TextDiff({
  original,
  modified,
  originalLabel = "Original",
  modifiedLabel = "Modified",
  view: controlledView,
  defaultView = "split",
  onViewChange,
  showToolbar = true,
  showLineNumbers = true,
  wrap: wrapProp,
  diffOptions,
  toolbarSlot,
  className,
}: TextDiffProps) {
  const [internalView, setInternalView] = useState<TextDiffView>(defaultView);
  const view = controlledView ?? internalView;
  const setView = (v: TextDiffView) => {
    if (!controlledView) setInternalView(v);
    onViewChange?.(v);
  };

  const [lineNumbers, setLineNumbers] = useState(showLineNumbers);
  const [internalWrap, setInternalWrap] = useState(wrapProp ?? false);
  const wrap = wrapProp ?? internalWrap;

  // Swap which side is the baseline (old) vs. the incoming version (new).
  // Lets the user flip the comparison without re-opening it — e.g. clipboard
  // compare defaults to "current ↔ clipboard" but can be flipped to
  // "clipboard ↔ current".
  const [swapped, setSwapped] = useState(false);
  const effOriginal = swapped ? modified : original;
  const effModified = swapped ? original : modified;
  const effOriginalLabel = swapped ? modifiedLabel : originalLabel;
  const effModifiedLabel = swapped ? originalLabel : modifiedLabel;

  const result = useMemo(
    () => computeTextDiff(effOriginal, effModified, diffOptions),
    [effOriginal, effModified, diffOptions],
  );

  const whitespace = wrap
    ? "whitespace-pre-wrap break-words"
    : "whitespace-pre";
  const summary = summarizeTextDiff(result.stats);

  return (
    <div className={cn("flex flex-col h-full min-h-0 bg-card", className)}>
      {showToolbar && (
        <div className="shrink-0 flex items-center gap-2 px-2 py-1 border-b border-border bg-muted/30 text-xs">
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setView("highlight")}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 transition-colors",
                view === "highlight"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
              title="Read the document with changes highlighted inline"
            >
              <Highlighter className="w-3.5 h-3.5" />
              Highlight
            </button>
            <button
              type="button"
              onClick={() => setView("split")}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 transition-colors",
                view === "split"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
              title="Side-by-side"
            >
              <Columns2 className="w-3.5 h-3.5" />
              Split
            </button>
            <button
              type="button"
              onClick={() => setView("inline")}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 transition-colors",
                view === "inline"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
              title="Unified inline"
            >
              <Rows3 className="w-3.5 h-3.5" />
              Inline
            </button>
          </div>

          {/* Swap baseline ↔ incoming. Applies to every view. */}
          <button
            type="button"
            onClick={() => setSwapped((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 px-2 h-7 rounded-md border border-border transition-colors",
              swapped
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
            title={`Swap sides — currently comparing ${effOriginalLabel} → ${effModifiedLabel}`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Swap
          </button>

          {/* Line numbers + wrap are line-grid concepts; the highlight view is
              flowing prose, so they don't apply there. */}
          {view !== "highlight" && (
            <>
              <button
                type="button"
                onClick={() => setLineNumbers((v) => !v)}
                className={cn(
                  "inline-flex items-center justify-center w-7 h-7 rounded-md border border-border transition-colors",
                  lineNumbers
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
                title="Toggle line numbers"
              >
                <Hash className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setInternalWrap((v) => !v)}
                disabled={wrapProp !== undefined}
                className={cn(
                  "inline-flex items-center justify-center w-7 h-7 rounded-md border border-border transition-colors disabled:opacity-50",
                  wrap
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
                title="Toggle word wrap"
              >
                <WrapText className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <div className="flex-1" />

          <span className="font-mono text-muted-foreground">
            {result.hasChanges ? summary : "No changes"}
            {result.whitespaceOnly && (
              <span className="ml-1 text-amber-500">(whitespace only)</span>
            )}
          </span>
          {toolbarSlot}
        </div>
      )}

      <div
        className={cn(
          "flex-1 min-h-0 overflow-auto",
          view === "highlight"
            ? "text-sm leading-relaxed"
            : "font-mono text-xs leading-relaxed",
        )}
      >
        {view === "highlight" ? (
          <div className="px-4 py-3">
            {result.inline
              .filter((line) => line.type !== "removed")
              .map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    "whitespace-pre-wrap break-words",
                    line.type === "added" && !line.segments && "rounded-sm",
                  )}
                >
                  {renderHighlightLine(
                    line.content,
                    line.type as "added" | "unchanged",
                    line.segments,
                  )}
                </div>
              ))}
          </div>
        ) : view === "split" ? (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/60 text-[0.7rem] text-muted-foreground">
                <th
                  colSpan={2}
                  className="text-left font-medium px-2 py-1 border-b border-r border-border"
                >
                  {effOriginalLabel}
                </th>
                <th
                  colSpan={2}
                  className="text-left font-medium px-2 py-1 border-b border-border"
                >
                  {effModifiedLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => {
                const leftTint = splitTint(row, "left");
                const rightTint = splitTint(row, "right");
                return (
                  <tr key={i}>
                    <td
                      className={cn(
                        "align-top px-1 border-r border-border/40",
                        leftTint,
                      )}
                    >
                      <LineNumber n={row.left.lineNumber} show={lineNumbers} />
                    </td>
                    <td
                      className={cn(
                        "align-top pr-3 pl-1 border-r border-border w-1/2",
                        leftTint,
                        whitespace,
                      )}
                    >
                      {renderSegments(row.left, "left")}
                    </td>
                    <td
                      className={cn(
                        "align-top px-1 border-r border-border/40",
                        rightTint,
                      )}
                    >
                      <LineNumber n={row.right.lineNumber} show={lineNumbers} />
                    </td>
                    <td
                      className={cn(
                        "align-top pr-3 pl-1 w-1/2",
                        rightTint,
                        whitespace,
                      )}
                    >
                      {renderSegments(row.right, "right")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div>
            {result.inline.map((line, i) => (
              <div
                key={i}
                className={cn("flex items-start", INLINE_BG[line.type])}
              >
                {lineNumbers && (
                  <>
                    <span className="select-none shrink-0 w-10 pr-1 text-right text-muted-foreground/50 tabular-nums">
                      {line.oldLineNumber ?? ""}
                    </span>
                    <span className="select-none shrink-0 w-10 pr-2 text-right text-muted-foreground/50 tabular-nums">
                      {line.newLineNumber ?? ""}
                    </span>
                  </>
                )}
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
                <span className={cn("flex-1 pr-3", whitespace)}>
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
        )}
      </div>
    </div>
  );
}

export default TextDiff;
