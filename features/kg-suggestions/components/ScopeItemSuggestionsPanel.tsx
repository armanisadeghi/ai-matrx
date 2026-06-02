// features/kg-suggestions/components/ScopeItemSuggestionsPanel.tsx
//
// Embedded under a scope-item editor: "N suggested fills for <slot>" with the
// same row UX as the popover. Drops in wherever a single scope-item slot is
// edited. Hidden entirely when there are no pending suggestions, so it costs
// zero visual space on slots with nothing to fill.

"use client";

import { Lightbulb } from "lucide-react";
import { useKgSuggestions } from "@/features/kg-suggestions/hooks/useKgSuggestions";
import { KgSuggestionRowItem } from "./KgSuggestionRowItem";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import type { KgScopeItemFilter } from "@/features/kg-suggestions/types";

export interface ScopeItemSuggestionsPanelProps {
  scopeItemId: string;
  /** Optional slot label for the heading. */
  slotName?: string | null;
  className?: string;
}

export function ScopeItemSuggestionsPanel({
  scopeItemId,
  slotName,
  className,
}: ScopeItemSuggestionsPanelProps) {
  const filter: KgScopeItemFilter = { scopeItemId, status: "pending" };
  const { items, count, status, accept, reject, defer } =
    useKgSuggestions(filter);

  // Loading shimmer only on first load; nothing once we know there are none.
  if (status === "loading" && items.length === 0) {
    return (
      <div className={cn("space-y-1.5", className)}>
        <Skeleton className="h-16 w-full rounded-md" />
      </div>
    );
  }

  if (count <= 0 || items.length === 0) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Lightbulb className="h-3.5 w-3.5 text-primary" />
        <span>
          {count} suggested {count === 1 ? "fill" : "fills"}
          {slotName ? ` for ${slotName}` : ""}
        </span>
      </div>
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
  );
}

export default ScopeItemSuggestionsPanel;
