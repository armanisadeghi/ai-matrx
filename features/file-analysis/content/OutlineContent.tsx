/**
 * OutlineContent — render the PDF's TOC as a clickable tree.
 *
 * Used in both the AnalysisTab and inside the StudioShell's right rail
 * (the rail wraps this).
 */

"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  asObject,
  findResult,
  type OutlineEntry,
  type OutlinePayload,
} from "./utils";
import type { FileAnalysisResultRow } from "@/features/file-analysis/api/file-analysis";

interface Props {
  results: FileAnalysisResultRow[];
  onJumpToPage?: (pageNumber: number) => void;
}

export function OutlineContent({ results, onJumpToPage }: Props) {
  const result = findResult(results, "page_outline");
  const payload = asObject<OutlinePayload>(result?.payload);
  const entries: OutlineEntry[] = payload?.entries ?? [];

  if (!entries.length) {
    return (
      <div className="rounded border border-dashed border-border bg-card/40 px-4 py-6 text-center text-xs text-muted-foreground">
        No PDF outline (table of contents) detected for this document.
      </div>
    );
  }

  return (
    <ul className="space-y-px text-xs">
      {entries.map((e) => (
        <li key={e.index}>
          <button
            type="button"
            onClick={() => onJumpToPage?.(e.page_number)}
            className={cn(
              "flex w-full items-baseline gap-1 rounded px-1.5 py-1 text-left hover:bg-accent/40",
            )}
            style={{ paddingLeft: 4 + (e.level - 1) * 14 }}
            title={e.title}
          >
            <ChevronRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{e.title || "(untitled)"}</span>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              p{e.page_number}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
