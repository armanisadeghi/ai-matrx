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
  /**
   * When set, only suggestions targeting THIS scope are shown. The backend
   * filter is by context-item id (shared across every scope of a type), so a
   * per-scope page must narrow client-side or it would surface fills meant for
   * a different scope of the same type.
   */
  scopeId?: string;
  /** Optional slot label for the heading. */
  slotName?: string | null;
  className?: string;
}

export function ScopeItemSuggestionsPanel({
  scopeItemId,
  scopeId,
  slotName,
  className,
}: ScopeItemSuggestionsPanelProps) {
  const filter: KgScopeItemFilter = { scopeItemId, status: "pending" };
  const {
    items: allItems,
    status,
    accept,
    reject,
    defer,
  } = useKgSuggestions(filter);

  const items = scopeId
    ? allItems.filter((r) => r.target.scope_id === scopeId)
    : allItems;
  const count = items.length;

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
