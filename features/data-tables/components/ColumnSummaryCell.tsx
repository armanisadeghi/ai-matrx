"use client";

/**
 * ColumnSummaryCell — one cell of the summary bar under the grid. Shows the
 * column's chosen aggregate (or a quiet "Summarize" affordance) and opens a
 * list to change it. The choice is per view (`summaries` in the view state).
 */

import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Check, Sigma } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  COLUMN_SUMMARY_LABELS,
  summaryKindsFor,
  type ColumnSummaryKind,
  type ColumnSummaryResult,
} from "../column-summaries";

type Props = {
  displayName: string;
  dataType: string;
  kind: ColumnSummaryKind | null;
  result: ColumnSummaryResult | null;
  /** True when the rows summarized are NOT the whole table (a page of a big table). */
  partial: boolean;
  onChange: (kind: ColumnSummaryKind | null) => void;
};

export function ColumnSummaryCell({
  displayName,
  dataType,
  kind,
  result,
  partial,
  onChange,
}: Props) {
  const kinds = summaryKindsFor(dataType);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group flex h-7 w-full min-w-0 items-center justify-end gap-1 rounded px-1 text-xs tabular-nums transition-colors hover:bg-muted/60",
            kind ? "text-foreground" : "text-transparent hover:text-muted-foreground",
          )}
          title={
            kind && result
              ? `${COLUMN_SUMMARY_LABELS[kind]} of ${displayName}: ${result.detail}${partial ? " — this page only" : ""}`
              : `Summarize ${displayName}`
          }
          aria-label={
            kind && result
              ? `${COLUMN_SUMMARY_LABELS[kind]} of ${displayName}: ${result.text}${partial ? ", this page only" : ""}`
              : `Summarize ${displayName}`
          }
        >
          {kind && result ? (
            <>
              <span className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                {COLUMN_SUMMARY_LABELS[kind]}
                {partial ? " · page" : ""}
              </span>
              <span className="shrink-0 font-medium">{result.text}</span>
            </>
          ) : (
            <>
              <Sigma className="h-3 w-3" />
              Summarize
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent sizing="content" align="end" className="p-1">
        <div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
          {displayName}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-full justify-start gap-2 px-2 text-xs font-normal"
          onClick={() => onChange(null)}
        >
          {kind === null ? <Check className="h-3.5 w-3.5" /> : <span className="w-3.5" />}
          None
        </Button>
        {kinds.map((k) => (
          <Button
            key={k}
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-full justify-start gap-2 px-2 text-xs font-normal"
            onClick={() => onChange(k)}
          >
            {kind === k ? <Check className="h-3.5 w-3.5" /> : <span className="w-3.5" />}
            {COLUMN_SUMMARY_LABELS[k]}
          </Button>
        ))}
        {partial && (
          <p className="px-2 pb-1 pt-1.5 text-[11px] leading-snug text-muted-foreground">
            Counts the rows on this page. Filter or use a smaller table to summarize everything.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default ColumnSummaryCell;
