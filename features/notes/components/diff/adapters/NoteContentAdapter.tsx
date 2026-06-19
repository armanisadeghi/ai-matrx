"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileText, EyeOff, Eye, ChevronDown } from "lucide-react";
import type {
  FieldAdapter,
  FieldDiffProps,
} from "@/components/diff/adapters/types";
import { analyzeDiff } from "@/features/notes/utils/diffAnalysis";
import { computeTextDiff } from "@/components/diff/text/engine/computeTextDiff";
import type {
  DiffCell,
  DiffRow as EngineDiffRow,
  LineChangeType,
} from "@/components/diff/text/engine/types";

const COLLAPSE_THRESHOLD = 6; // Collapse unchanged sections longer than this

function NoteContentDiffRenderer({ node }: FieldDiffProps) {
  const oldContent = typeof node.oldValue === "string" ? node.oldValue : "";
  const newContent = typeof node.newValue === "string" ? node.newValue : "";
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    new Set(),
  );

  // Word/line-level engine: aligns removed+added into MODIFIED pairs and emits
  // intra-line word segments so a one-word edit highlights only that word.
  // The gate, the body, AND the stats line all read from this single result,
  // so the header count can never disagree with the rendered rows.
  const result = useMemo(
    () =>
      computeTextDiff(oldContent, newContent, {
        ignoreTrailingWhitespace: ignoreWhitespace,
        wordLevel: true,
        granularity: "word",
      }),
    [oldContent, newContent, ignoreWhitespace],
  );

  const linesChanged =
    result.stats.additions + result.stats.deletions + result.stats.modifications;

  if (!result.hasChanges) {
    return (
      <div className="grid grid-cols-[200px_1fr] text-xs">
        <div className="border-r border-border" />
        <div className="px-3 py-3 text-muted-foreground">
          {ignoreWhitespace
            ? "No changes (whitespace differences only)"
            : "Content is identical"}
        </div>
      </div>
    );
  }

  // Build line-by-line rows from the engine output (word segments included)
  const rows = buildRows(result.rows);

  // Group consecutive unchanged rows for collapsing
  const groups = groupRows(rows);

  const toggleSection = (idx: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div>
      {/* Stats bar */}
      <div className="grid grid-cols-[200px_1fr] text-xs border-b border-border/50">
        <div className="border-r border-border" />
        <div className="px-3 py-1.5 flex items-center gap-3 text-muted-foreground">
          <span>
            {linesChanged} line{linesChanged !== 1 ? "s" : ""} changed
          </span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[0.625rem] gap-1"
            onClick={() => setIgnoreWhitespace((v) => !v)}
          >
            {ignoreWhitespace ? (
              <Eye className="w-3 h-3" />
            ) : (
              <EyeOff className="w-3 h-3" />
            )}
            {ignoreWhitespace ? "Show whitespace" : "Ignore whitespace"}
          </Button>
        </div>
      </div>

      {/* Line-by-line diff */}
      {groups.map((group, groupIdx) => {
        if (
          group.type === "unchanged" &&
          group.rows.length > COLLAPSE_THRESHOLD
        ) {
          const isExpanded = expandedSections.has(groupIdx);
          if (!isExpanded) {
            // Show first 2 and last 2 lines, collapse middle
            const first = group.rows.slice(0, 2);
            const last = group.rows.slice(-2);
            const hiddenCount = group.rows.length - 4;

            return (
              <div key={groupIdx}>
                {first.map((row, i) => (
                  <DiffRow key={`${groupIdx}-first-${i}`} row={row} />
                ))}
                <div className="grid grid-cols-[200px_1fr_1fr] text-xs">
                  <div className="border-r border-border" />
                  <div className="col-span-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-full text-[0.625rem] gap-1 text-muted-foreground justify-center rounded-none"
                      onClick={() => toggleSection(groupIdx)}
                    >
                      <ChevronDown className="w-3 h-3" />
                      {hiddenCount} unchanged line{hiddenCount !== 1 ? "s" : ""}
                    </Button>
                  </div>
                </div>
                {last.map((row, i) => (
                  <DiffRow key={`${groupIdx}-last-${i}`} row={row} />
                ))}
              </div>
            );
          }
        }

        return (
          <div key={groupIdx}>
            {group.rows.map((row, i) => (
              <DiffRow key={`${groupIdx}-${i}`} row={row} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

interface DiffRowData {
  type: LineChangeType;
  lineNum: number | string;
  left: DiffCell;
  right: DiffCell;
}

/** Render a cell with word-level segments; identical words stay plain. */
function renderCell(cell: DiffCell, side: "left" | "right"): React.ReactNode {
  if (cell.content === null) return "";
  if (!cell.segments || cell.segments.length === 0) return cell.content;
  const keep = side === "left" ? "removed" : "added";
  return cell.segments.map((seg, i) => {
    if (seg.type === "unchanged") return <span key={i}>{seg.value}</span>;
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

function DiffRow({ row }: { row: DiffRowData }) {
  const isRemoved = row.type === "removed" || row.type === "modified";
  const isAdded = row.type === "added" || row.type === "modified";
  return (
    <div className="grid grid-cols-[200px_1fr_1fr] text-xs">
      <div className="px-3 py-0.5 border-r border-border text-muted-foreground/50 text-right font-mono tabular-nums">
        {row.lineNum}
      </div>
      <div
        className={cn(
          "px-3 py-0.5 border-r border-border whitespace-pre-wrap break-words font-mono",
          isRemoved
            ? "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-300"
            : "",
          row.type === "unchanged" ? "text-foreground/70" : "",
          row.type === "added" ? "text-muted-foreground/30" : "",
        )}
      >
        {renderCell(row.left, "left")}
      </div>
      <div
        className={cn(
          "px-3 py-0.5 whitespace-pre-wrap break-words font-mono",
          isAdded
            ? "bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-300"
            : "",
          row.type === "unchanged" ? "text-foreground/70" : "",
          row.type === "removed" ? "text-muted-foreground/30" : "",
        )}
      >
        {renderCell(row.right, "right")}
      </div>
    </div>
  );
}

function buildRows(engineRows: EngineDiffRow[]): DiffRowData[] {
  return engineRows.map((r) => ({
    type: r.type,
    lineNum: r.right.lineNumber ?? r.left.lineNumber ?? "",
    left: r.left,
    right: r.right,
  }));
}

function groupRows(
  rows: DiffRowData[],
): { type: DiffRowData["type"]; rows: DiffRowData[] }[] {
  const groups: { type: DiffRowData["type"]; rows: DiffRowData[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.type === row.type) {
      last.rows.push(row);
    } else {
      groups.push({ type: row.type, rows: [row] });
    }
  }
  return groups;
}

export const NoteContentAdapter: FieldAdapter = {
  label: "Content",
  icon: FileText,
  renderDiff: NoteContentDiffRenderer,
  toSummaryText: (node) => {
    const oldContent = typeof node.oldValue === "string" ? node.oldValue : "";
    const newContent = typeof node.newValue === "string" ? node.newValue : "";
    if (oldContent === newContent) return "No changes";
    const analysis = analyzeDiff(oldContent, newContent);
    return analysis.summary;
  },
};
