// features/kg-suggestions/components/HeavyHitterSuggestionsInbox.tsx
//
// The "Suggest a scope" inbox (Phase F.4). Lists match_kind='heavy_hitter'
// suggestions — recurring unaffiliated entities the nightly detector proposes
// promoting to a new scope ("Acme Corp appears in 5 places — make it a
// Client?"). Drops into the /scopes hub.
//
// Heavy-hitter ACCEPT (2026-06-07, direct-Supabase): the row's "Create scope"
// button opens HeavyHitterAcceptDialog (confirm name + pick scope type), and
// confirming runs create scope (create_scope RPC) → tag the originating source
// → mark the suggestion accepted, all via useHeavyHitterAccept. There is no
// backend accept endpoint anymore. All of that lives inside KgSuggestionRowItem,
// so this inbox just lists the rows and an easy Reject/Defer.
//
// Hidden entirely when there are no heavy-hitter suggestions, so it costs zero
// space on the hub until the detector finds something.

"use client";

import { Network } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useKgSuggestions } from "@/features/kg-suggestions/hooks/useKgSuggestions";
import { KgSuggestionRowItem } from "./KgSuggestionRowItem";
import type { KgGlobalFilter } from "@/features/kg-suggestions/types";

export function HeavyHitterSuggestionsInbox({
  className,
}: {
  className?: string;
}) {
  const filter: KgGlobalFilter = { global: true, status: "pending" };
  const { items, status, accept, reject, defer } = useKgSuggestions(filter);

  // React Compiler is on — no manual memoization.
  const heavyHitters = items.filter((r) => r.match_kind === "heavy_hitter");

  if (status === "loading" && items.length === 0) {
    return (
      <div className={className}>
        <Skeleton className="h-20 w-full rounded-md" />
      </div>
    );
  }

  if (heavyHitters.length === 0) return null;

  return (
    <Card className={className}>
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <Network className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          Suggest a scope
        </span>
        <span className="text-xs text-muted-foreground">
          {heavyHitters.length} recurring{" "}
          {heavyHitters.length === 1 ? "entity" : "entities"}
        </span>
      </div>
      <div className="space-y-1.5 p-2">
        {heavyHitters.map((row) => (
          <KgSuggestionRowItem
            key={row.id}
            row={row}
            accept={accept}
            reject={reject}
            defer={defer}
          />
        ))}
      </div>
    </Card>
  );
}

export default HeavyHitterSuggestionsInbox;
