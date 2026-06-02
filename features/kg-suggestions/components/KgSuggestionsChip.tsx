// features/kg-suggestions/components/KgSuggestionsChip.tsx
//
// A compact "N pending" badge that drops in next to any source surface's
// scope tagger (notes, tasks, scrapes, …). Hidden entirely when count === 0,
// so it never adds noise where there's nothing to act on. Clicking opens the
// popover with the actionable list.
//
// The chip fetches its own count (autoFetch) via useKgSuggestions keyed by the
// source filter, so it stays in sync with accept/reject/defer from anywhere.

"use client";

import { useState } from "react";
import { Lightbulb } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils/cn";
import { useKgSuggestions } from "@/features/kg-suggestions/hooks/useKgSuggestions";
import { KgSuggestionsPopover } from "./KgSuggestionsPopover";
import type { KgSourceFilter } from "@/features/kg-suggestions/types";

export interface KgSuggestionsChipProps {
  /** The source entity this chip surfaces suggestions for. */
  filter: Pick<KgSourceFilter, "sourceKind" | "sourceId">;
  className?: string;
  /** Optional label override. Default "suggestion(s)". */
  label?: string;
}

export function KgSuggestionsChip({
  filter,
  className,
  label,
}: KgSuggestionsChipProps) {
  const [open, setOpen] = useState(false);
  const sourceFilter: KgSourceFilter = {
    sourceKind: filter.sourceKind,
    sourceId: filter.sourceId,
    status: "pending",
  };
  const { count } = useKgSuggestions(sourceFilter);

  if (count <= 0) return null;

  const text = label ?? (count === 1 ? "suggestion" : "suggestions");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors",
            className,
          )}
          aria-label={`${count} pending knowledge-graph ${text}`}
        >
          <Lightbulb className="h-3 w-3" />
          <span className="tabular-nums">{count}</span>
          <span className="hidden sm:inline">{text}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 p-0"
        // Don't steal focus from the host editor on open.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <KgSuggestionsPopover filter={sourceFilter} />
      </PopoverContent>
    </Popover>
  );
}

export default KgSuggestionsChip;
