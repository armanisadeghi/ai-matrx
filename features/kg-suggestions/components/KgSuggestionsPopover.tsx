// features/kg-suggestions/components/KgSuggestionsPopover.tsx
//
// Lists the pending suggestions for one filter (source or scope-item). Drops
// into a PopoverContent (from the chip) or can be embedded directly. Each row
// is the shared KgSuggestionRowItem with accept/reject/defer. Optimistic
// removal happens in the hook; this component just renders the current list.

"use client";

import { Lightbulb } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useKgSuggestions } from "@/features/kg-suggestions/hooks/useKgSuggestions";
import { KgSuggestionRowItem } from "./KgSuggestionRowItem";
import type { KgSuggestionsFilter } from "@/features/kg-suggestions/types";

export interface KgSuggestionsPopoverProps {
  filter: KgSuggestionsFilter;
  /** Optional heading shown above the list. */
  title?: string;
  className?: string;
}

export function KgSuggestionsPopover({
  filter,
  title = "Suggested fills",
  className,
}: KgSuggestionsPopoverProps) {
  const { items, status, error, accept, reject, defer } =
    useKgSuggestions(filter);

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <Lightbulb className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-foreground">{title}</span>
      </div>

      <ScrollArea className="max-h-80">
        <div className="space-y-1.5 p-2">
          {status === "loading" && items.length === 0 ? (
            <>
              <Skeleton className="h-20 w-full rounded-md" />
              <Skeleton className="h-20 w-full rounded-md" />
            </>
          ) : null}

          {status === "error" ? (
            <div className="px-1 py-3 text-xs text-destructive">
              Couldn&apos;t load suggestions{error ? `: ${error}` : "."}
            </div>
          ) : null}

          {status === "success" && items.length === 0 ? (
            <div className="px-1 py-4 text-center text-xs text-muted-foreground">
              No pending suggestions.
            </div>
          ) : null}

          {items.map((row) => (
            <KgSuggestionRowItem
              key={row.id}
              row={row}
              accept={accept}
              reject={reject}
              defer={defer}
              compact
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export default KgSuggestionsPopover;
