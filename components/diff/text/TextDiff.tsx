"use client";

// components/diff/text/TextDiff.tsx
//
// Headless LIGHT diff core for plain text / markdown. Pure presentation:
// no Redux, no overlay, no router. Renders the canonical text diff engine
// output as either an inline (unified) or split (side-by-side) view with
// optional word/char-level highlighting. Drop it into a route, window,
// modal, sheet, or any region of a page — it fills its container.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Columns2,
  Rows3,
  WrapText,
  Hash,
  Highlighter,
  ArrowLeftRight,
  ArrowUp,
  ArrowDown,
  FoldVertical,
  UnfoldVertical,
  ChevronsDownUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { computeTextDiff, summarizeTextDiff } from "./engine/computeTextDiff";
import type {
  DiffCell,
  DiffRow,
  TextDiffOptions,
  WordSegment,
} from "./engine/types";
import {
  GUTTER,
  INLINE_BG,
  LINE_BG,
  WORD_BG,
  splitSideTint,
  wordSegmentClass,
} from "./diffColors";

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

// Diff colors come from the shared ./diffColors module (LINE_BG / WORD_BG /
// GUTTER / INLINE_BG / splitSideTint / wordSegmentClass) so every renderer
// stays in lockstep \u2014 see that file.

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
      <span key={i} className={cn("rounded-[2px]", wordSegmentClass(side))}>
        {seg.value}
      </span>
    );
  });
}

// Per-side tint for the split (side-by-side) view, from the shared module.
function splitTint(row: DiffRow, side: "left" | "right"): string {
  const cell = side === "left" ? row.left : row.right;
  return splitSideTint(row.type, side, cell.content === null);
}

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
      <span className={cn("rounded-[2px]", LINE_BG.added)}>
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

/** Unchanged lines to keep around each change when folding. */
const CONTEXT_LINES = 3;

/** Which indices are visible when collapsed: every changed row + `ctx` rows
 * on each side of it. */
function computeVisibility(changed: boolean[], ctx: number): boolean[] {
  const n = changed.length;
  const vis = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (changed[i]) {
      for (let j = Math.max(0, i - ctx); j <= Math.min(n - 1, i + ctx); j++) {
        vis[j] = true;
      }
    }
  }
  return vis;
}

/** Start index of each contiguous run of changed rows — the nav targets. */
function groupStarts(changed: boolean[]): number[] {
  const starts: number[] = [];
  for (let i = 0; i < changed.length; i++) {
    if (changed[i] && (i === 0 || !changed[i - 1])) starts.push(i);
  }
  return starts;
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
  // Wrap is ON by default (long lines soft-wrap instead of scrolling off-screen);
  // the user can toggle it off. A `wrap` prop still forces the value.
  const [internalWrap, setInternalWrap] = useState(wrapProp ?? true);
  const wrap = wrapProp ?? internalWrap;

  // Collapse unchanged context (fold), so large files show only the changes with
  // a few lines around each — expandable. Split/inline only.
  const [collapse, setCollapse] = useState(true);
  const [expandedRuns, setExpandedRuns] = useState<Set<number>>(new Set());
  const [flashRow, setFlashRow] = useState<number | null>(null);
  const rowRefs = useRef<Record<number, HTMLElement | null>>({});
  const navCursor = useRef(-1);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

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

  // Fold + navigation data for the active line-grid view (split uses rows,
  // inline uses inline lines). Computed from the single `result` — no re-diff.
  const changed = useMemo(
    () =>
      (view === "split" ? result.rows : result.inline).map(
        (it) => it.type !== "unchanged",
      ),
    [view, result],
  );
  const visible = useMemo(
    () => (collapse ? computeVisibility(changed, CONTEXT_LINES) : null),
    [changed, collapse],
  );
  const changeStarts = useMemo(() => groupStarts(changed), [changed]);

  // Reset fold/nav state when the inputs or view change.
  useEffect(() => {
    setExpandedRuns(new Set());
    navCursor.current = -1;
  }, [result, view]);

  const gotoChange = (dir: 1 | -1) => {
    if (changeStarts.length === 0) return;
    navCursor.current =
      dir === 1
        ? (navCursor.current + 1) % changeStarts.length
        : (navCursor.current - 1 + changeStarts.length) % changeStarts.length;
    const idx = changeStarts[navCursor.current];
    rowRefs.current[idx]?.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlashRow(idx);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashRow(null), 1200);
  };

  const expandRun = (start: number) =>
    setExpandedRuns((prev) => new Set(prev).add(start));

  // Render body with folding: walk the items, collapse maximal hidden runs into
  // a single "expand N lines" control (unless that run has been expanded).
  function foldedBody(
    length: number,
    renderItem: (i: number) => React.ReactNode,
    renderFold: (runStart: number, count: number) => React.ReactNode,
  ): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    let i = 0;
    while (i < length) {
      if (visible && !visible[i]) {
        let j = i;
        while (j < length && !visible[j]) j++;
        if (expandedRuns.has(i)) {
          for (let k = i; k < j; k++) out.push(renderItem(k));
        } else {
          out.push(renderFold(i, j - i));
        }
        i = j;
      } else {
        out.push(renderItem(i));
        i++;
      }
    }
    return out;
  }

  const isChangeStart = (i: number) => changeStarts.includes(i);

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
              <button
                type="button"
                onClick={() => setCollapse((v) => !v)}
                className={cn(
                  "inline-flex items-center justify-center w-7 h-7 rounded-md border border-border transition-colors",
                  collapse
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
                title={
                  collapse
                    ? "Showing changes only — click to show all unchanged lines"
                    : "Showing all lines — click to collapse unchanged context"
                }
              >
                {collapse ? (
                  <FoldVertical className="w-3.5 h-3.5" />
                ) : (
                  <UnfoldVertical className="w-3.5 h-3.5" />
                )}
              </button>
              {changeStarts.length > 0 && (
                <div className="inline-flex items-center rounded-md border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => gotoChange(-1)}
                    className="inline-flex items-center justify-center w-7 h-7 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title="Previous change"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => gotoChange(1)}
                    className="inline-flex items-center justify-center w-7 h-7 border-l border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title={`Next change (${changeStarts.length} total)`}
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
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
              {foldedBody(
                result.rows.length,
                (i) => {
                  const row = result.rows[i];
                  const leftTint = splitTint(row, "left");
                  const rightTint = splitTint(row, "right");
                  const start = isChangeStart(i);
                  const flash = flashRow === i;
                  return (
                    <tr
                      key={i}
                      ref={
                        start
                          ? (el) => {
                              rowRefs.current[i] = el;
                            }
                          : undefined
                      }
                    >
                      <td
                        className={cn(
                          "align-top px-1 border-r border-border/40",
                          leftTint,
                          flash && "!bg-primary/20",
                        )}
                      >
                        <LineNumber n={row.left.lineNumber} show={lineNumbers} />
                      </td>
                      <td
                        className={cn(
                          "align-top pr-3 pl-1 border-r border-border w-1/2",
                          leftTint,
                          flash && "!bg-primary/20",
                          whitespace,
                        )}
                      >
                        {renderSegments(row.left, "left")}
                      </td>
                      <td
                        className={cn(
                          "align-top px-1 border-r border-border/40",
                          rightTint,
                          flash && "!bg-primary/20",
                        )}
                      >
                        <LineNumber n={row.right.lineNumber} show={lineNumbers} />
                      </td>
                      <td
                        className={cn(
                          "align-top pr-3 pl-1 w-1/2",
                          rightTint,
                          flash && "!bg-primary/20",
                          whitespace,
                        )}
                      >
                        {renderSegments(row.right, "right")}
                      </td>
                    </tr>
                  );
                },
                (runStart, count) => (
                  <tr key={`fold-${runStart}`}>
                    <td colSpan={4} className="p-0">
                      <button
                        type="button"
                        onClick={() => expandRun(runStart)}
                        className="flex w-full items-center gap-1.5 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        title="Expand hidden unchanged lines"
                      >
                        <ChevronsDownUp className="w-3 h-3" />
                        Expand {count} unchanged line{count === 1 ? "" : "s"}
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        ) : (
          <div>
            {foldedBody(
              result.inline.length,
              (i) => {
                const line = result.inline[i];
                const start = isChangeStart(i);
                const flash = flashRow === i;
                return (
                  <div
                    key={i}
                    ref={
                      start
                        ? (el) => {
                            rowRefs.current[i] = el;
                          }
                        : undefined
                    }
                    className={cn(
                      "flex items-start",
                      INLINE_BG[line.type],
                      flash && "!bg-primary/20",
                    )}
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
                );
              },
              (runStart, count) => (
                <button
                  key={`fold-${runStart}`}
                  type="button"
                  onClick={() => expandRun(runStart)}
                  className="flex w-full items-center gap-1.5 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Expand hidden unchanged lines"
                >
                  <ChevronsDownUp className="w-3 h-3" />
                  Expand {count} unchanged line{count === 1 ? "" : "s"}
                </button>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default TextDiff;
