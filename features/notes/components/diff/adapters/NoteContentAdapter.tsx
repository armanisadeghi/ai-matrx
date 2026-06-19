"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileText, EyeOff, Eye, ChevronDown } from "lucide-react";
import type { FieldAdapter, FieldDiffProps } from "@/components/diff/adapters/types";
import { analyzeDiff } from "@/features/notes/utils/diffAnalysis";
import type { DiffSegment } from "@/features/notes/utils/diffAnalysis";

const COLLAPSE_THRESHOLD = 6; // Collapse unchanged sections longer than this

function NoteContentDiffRenderer({ node }: FieldDiffProps) {
  const oldContent = typeof node.oldValue === "string" ? node.oldValue : "";
  const newContent = typeof node.newValue === "string" ? node.newValue : "";
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());

  const analysis = useMemo(() => analyzeDiff(oldContent, newContent), [oldContent, newContent]);

  const showDiff = ignoreWhitespace ? analysis.hasChangesExcludingWhitespace : analysis.hasChanges;

  if (!showDiff) {
    return (
      <div className="grid grid-cols-[200px_1fr] text-xs">
        <div className="border-r border-border" />
        <div className="px-3 py-3 text-muted-foreground">
          {ignoreWhitespace ? "No changes (whitespace differences only)" : "Content is identical"}
        </div>
      </div>
    );
  }

  // Build line-by-line rows from segments
  const rows = buildRows(analysis.segments, ignoreWhitespace);

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
            {analysis.linesChanged} line{analysis.linesChanged !== 1 ? "s" : ""} changed
            {analysis.charsChanged > 0 && ` · ${analysis.charsChanged} chars`}
          </span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[0.625rem] gap-1"
            onClick={() => setIgnoreWhitespace((v) => !v)}
          >
            {ignoreWhitespace ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            {ignoreWhitespace ? "Show whitespace" : "Ignore whitespace"}
          </Button>
        </div>
      </div>

      {/* Line-by-line diff */}
      {groups.map((group, groupIdx) => {
        if (group.type === "unchanged" && group.rows.length > COLLAPSE_THRESHOLD) {
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
                  <td colSpan={2}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-full text-[0.625rem] gap-1 text-muted-foreground justify-center rounded-none"
                      onClick={() => toggleSection(groupIdx)}
                    >
                      <ChevronDown className="w-3 h-3" />
                      {hiddenCount} unchanged line{hiddenCount !== 1 ? "s" : ""}
                    </Button>
                  </td>
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
  type: "unchanged" | "removed" | "added";
  lineNum: number;
  oldLine: string | null;
  newLine: string | null;
}

function DiffRow({ row }: { row: DiffRowData }) {
  return (
    <div className="grid grid-cols-[200px_1fr_1fr] text-xs">
      <div className="px-3 py-0.5 border-r border-border text-muted-foreground/50 text-right font-mono tabular-nums">
        {row.lineNum}
      </div>
      <div
        className={cn(
          "px-3 py-0.5 border-r border-border whitespace-pre-wrap break-words font-mono",
          row.type === "removed" ? "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-300" : "",
          row.type === "unchanged" ? "text-foreground/70" : "",
          row.type === "added" ? "text-muted-foreground/30" : "",
        )}
      >
        {row.oldLine ?? ""}
      </div>
      <div
        className={cn(
          "px-3 py-0.5 whitespace-pre-wrap break-words font-mono",
          row.type === "added" ? "bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-300" : "",
          row.type === "unchanged" ? "text-foreground/70" : "",
          row.type === "removed" ? "text-muted-foreground/30" : "",
        )}
      >
        {row.newLine ?? ""}
      </div>
    </div>
  );
}

function buildRows(segments: DiffSegment[], ignoreWhitespace: boolean): DiffRowData[] {
  const rows: DiffRowData[] = [];
  let lineNum = 1;

  for (const segment of segments) {
    const lines = segment.content.split("\n");
    for (const line of lines) {
      if (ignoreWhitespace && segment.type !== "unchanged") {
        // Skip whitespace-only changes
        if (line.trim() === "") continue;
      }

      if (segment.type === "unchanged") {
        rows.push({ type: "unchanged", lineNum: lineNum++, oldLine: line, newLine: line });
      } else if (segment.type === "removed") {
        rows.push({ type: "removed", lineNum: lineNum++, oldLine: line, newLine: null });
      } else if (segment.type === "added") {
        rows.push({ type: "added", lineNum: lineNum++, oldLine: null, newLine: line });
      }
    }
  }

  return rows;
}

function groupRows(rows: DiffRowData[]): { type: DiffRowData["type"]; rows: DiffRowData[] }[] {
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
