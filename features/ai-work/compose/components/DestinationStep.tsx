"use client";

/**
 * Step 1 — WHO does the work.
 *
 * Every destination the product intends to offer is listed. Exactly one is
 * selectable today; the rest state the real reason they are not, sourced from
 * `destinationAvailability` (which reads the LIVE managed-runtime contract for
 * Claude Code). No fake Run button, no invented availability, and no hidden
 * option the user cannot find later.
 */

import { CircleDot, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ManagedCapability } from "@/features/ai-work/lib/managedClaudeCapability";
import {
  WORK_DESTINATIONS,
  destinationAvailability,
  type WorkDestinationId,
} from "../destinations";

export function DestinationStep({
  value,
  capability,
  onChange,
}: {
  value: WorkDestinationId;
  capability: ManagedCapability;
  onChange: (id: WorkDestinationId) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {WORK_DESTINATIONS.map((destination) => {
        const { selectable, reason } = destinationAvailability(
          destination.id,
          capability,
        );
        const selected = selectable && value === destination.id;
        return (
          <li key={destination.id}>
            <button
              type="button"
              disabled={!selectable}
              onClick={() => onChange(destination.id)}
              aria-pressed={selected}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-background",
                selectable
                  ? "hover:border-primary/50"
                  : "cursor-not-allowed opacity-70",
              )}
            >
              {selectable ? (
                <CircleDot
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    selected ? "text-primary" : "text-muted-foreground",
                  )}
                />
              ) : (
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">
                  {destination.label}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {destination.summary}
                </span>
                {!selectable && reason && (
                  <span className="mt-1 block text-xs text-amber-600 dark:text-amber-400">
                    Not available here yet — {reason}
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
