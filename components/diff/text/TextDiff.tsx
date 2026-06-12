"use client";

// components/diff/text/TextDiff.tsx
//
// Headless LIGHT diff core for plain text / markdown. Pure presentation:
// no Redux, no overlay, no router. Renders the canonical text diff engine
// output as either an inline (unified) or split (side-by-side) view with
// optional word/char-level highlighting. Drop it into a route, window,
// modal, sheet, or any region of a page — it fills its container.

import { useMemo, useState } from "react";
import { Columns2, Rows3, WrapText, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeTextDiff, summarizeTextDiff } from "./engine/computeTextDiff";
import type { DiffCell, TextDiffOptions, WordSegment } from "./engine/types";

export type TextDiffView = "inline" | "split";

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
          side === "left"
            ? "bg-red-300/60 dark:bg-red-500/40"
            : "bg-green-300/60 dark:bg-green-500/40",
        )}
      >
        {seg.value}
      </span>
    );
  });
}

const ROW_TINT = {
  added: "bg-green-50 dark:bg-green-950/40",
  removed: "bg-red-50 dark:bg-red-950/40",
  modified: "bg-amber-50/60 dark:bg-amber-950/20",
  unchanged: "",
} as const;

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

  const result = useMemo(
    () => computeTextDiff(original, modified, diffOptions),
    [original, modified, diffOptions],
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

      <div className="flex-1 min-h-0 overflow-auto font-mono text-xs leading-relaxed">
        {view === "split" ? (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/60 text-[0.7rem] text-muted-foreground">
                <th
                  colSpan={2}
                  className="text-left font-medium px-2 py-1 border-b border-r border-border"
                >
                  {originalLabel}
                </th>
                <th
                  colSpan={2}
                  className="text-left font-medium px-2 py-1 border-b border-border"
                >
                  {modifiedLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i}>
                  <td
                    className={cn(
                      "align-top px-1 border-r border-border/40",
                      ROW_TINT[
                        row.left.content === null ? "unchanged" : row.type
                      ],
                      row.left.content === null && "bg-muted/30",
                    )}
                  >
                    <LineNumber n={row.left.lineNumber} show={lineNumbers} />
                  </td>
                  <td
                    className={cn(
                      "align-top pr-3 pl-1 border-r border-border w-1/2",
                      ROW_TINT[
                        row.left.content === null ? "unchanged" : row.type
                      ],
                      row.left.content === null && "bg-muted/20",
                      whitespace,
                    )}
                  >
                    {renderSegments(row.left, "left")}
                  </td>
                  <td
                    className={cn(
                      "align-top px-1 border-r border-border/40",
                      ROW_TINT[
                        row.right.content === null ? "unchanged" : row.type
                      ],
                      row.right.content === null && "bg-muted/30",
                    )}
                  >
                    <LineNumber n={row.right.lineNumber} show={lineNumbers} />
                  </td>
                  <td
                    className={cn(
                      "align-top pr-3 pl-1 w-1/2",
                      ROW_TINT[
                        row.right.content === null ? "unchanged" : row.type
                      ],
                      row.right.content === null && "bg-muted/20",
                      whitespace,
                    )}
                  >
                    {renderSegments(row.right, "right")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div>
            {result.inline.map((line, i) => (
              <div
                key={i}
                className={cn("flex items-start", ROW_TINT[line.type])}
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
                    line.type === "added" &&
                      "text-green-600 dark:text-green-400",
                    line.type === "removed" && "text-red-600 dark:text-red-400",
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
