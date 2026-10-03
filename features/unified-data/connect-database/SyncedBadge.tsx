"use client";

// features/unified-data/connect-database/SyncedBadge.tsx — LANE VISION-REACH, wave 3.
// The one mark on a table synced from outside AI Matrx (`sync_source.provider`): the data home's
// row and the table page's header wear the same chip. The same chip family as Foundation.

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { OUTSIDE_DATABASE_PROVIDER } from "./service";

/** Tooltip words per provider; an unknown provider still says it is synced. */
function syncedFromWords(provider: string): string {
  if (provider === OUTSIDE_DATABASE_PROVIDER) return "Rows come from an outside database; your own columns sit beside them.";
  if (provider === "google_sheets") return "Rows come from a Google Sheet; your own columns sit beside them.";
  return "Rows come from outside AI Matrx; your own columns sit beside them.";
}

export function SyncedBadge({ provider }: { provider: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          data-synced-badge={provider}
          className="inline-flex h-5 shrink-0 items-center rounded-full border border-border px-2 text-[11px] text-muted-foreground"
        >
          Synced
        </span>
      </TooltipTrigger>
      <TooltipContent>{syncedFromWords(provider)}</TooltipContent>
    </Tooltip>
  );
}
