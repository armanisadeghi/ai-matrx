/**
 * ClassificationContent — chip grid of every page with its detected class.
 */

"use client";

import { cn } from "@/lib/utils";
import {
  asObject,
  findResult,
  type ClassificationPayload,
} from "./utils";
import type { FileAnalysisResultRow } from "@/features/file-analysis/api/file-analysis";

const COLORS: Record<string, string> = {
  cover: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  toc: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  body: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  exhibit: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  billing: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  signature: "bg-pink-500/15 text-pink-700 dark:text-pink-300",
  appendix: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  blank: "bg-muted text-muted-foreground",
  "image-only": "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
  "footer-only": "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  unknown: "bg-muted text-muted-foreground",
};

interface Props {
  results: FileAnalysisResultRow[];
  onJumpToPage?: (pageNumber: number) => void;
}

export function ClassificationContent({ results, onJumpToPage }: Props) {
  const result = findResult(results, "page_classification");
  const payload = asObject<ClassificationPayload>(result?.payload);
  const pages = payload?.pages ?? [];

  if (!pages.length) {
    return (
      <div className="rounded border border-dashed border-border bg-card/40 px-4 py-6 text-center text-xs text-muted-foreground">
        Page classification hasn't finished yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {pages.map((p) => (
        <button
          key={p.page_number}
          type="button"
          onClick={() => onJumpToPage?.(p.page_number)}
          className={cn(
            "flex min-w-0 flex-col gap-1.5 rounded-md border border-border bg-card px-2.5 py-2 text-left transition-colors hover:bg-accent/40",
          )}
          title={p.indicators?.join(", ")}
        >
          <div className="flex min-w-0 items-center justify-between gap-1.5 text-[11px]">
            <span className="font-medium tabular-nums">Page {p.page_number}</span>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {Math.round(p.confidence * 100)}%
            </span>
          </div>
          <span
            className={cn(
              "inline-block max-w-full self-start truncate rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
              COLORS[p.page_class] ?? COLORS.unknown,
            )}
          >
            {p.page_class}
          </span>
          {p.indicators?.length ? (
            <div className="line-clamp-2 text-[10px] leading-snug text-muted-foreground">
              {p.indicators.join(" · ")}
            </div>
          ) : null}
        </button>
      ))}
    </div>
  );
}
