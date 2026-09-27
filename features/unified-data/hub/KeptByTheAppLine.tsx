"use client";

// features/unified-data/hub/KeptByTheAppLine.tsx
//
// THE ONE "SHOW EVERYTHING" LINE for tables the app keeps for itself (a column's choice list, a
// booking page's slots, a test's choices — `kept_by_the_app` on `custom.table_list_everywhere`
// and `custom.table_facts`). The /data-v2 home drew it inline; the organization's Tables page
// listed those tables as ordinary ones (lane PROOF-DEFECTS, D5). Both now draw this line: absent
// when the app keeps nothing, one sentence and one button otherwise.

import { Button } from "@ai-matrx/design-system";

export interface KeptByTheAppLineProps {
  keptCount: number;
  showEverything: boolean;
  onToggle: () => void;
}

export function KeptByTheAppLine({ keptCount, showEverything, onToggle }: KeptByTheAppLineProps) {
  if (keptCount === 0) return null;
  const noun = keptCount === 1 ? "table" : "tables";
  return (
    <div
      data-hub-show-everything={showEverything ? "on" : "off"}
      className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
    >
      <span>
        {showEverything
          ? `Showing everything, including the ${keptCount} ${noun} the app keeps for itself.`
          : `${keptCount} ${noun} the app keeps for itself ${keptCount === 1 ? "is" : "are"} not listed here.`}
      </span>
      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onToggle}>
        {showEverything ? "Hide what the app keeps" : "Show everything"}
      </Button>
    </div>
  );
}
