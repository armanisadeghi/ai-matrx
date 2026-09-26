"use client";

// THE MAP — every place in the feature where intelligence runs, as stops.
// Hovering a job lights up the stops it runs in; hovering a stop lights up its
// jobs (the host reads `onHoverPlace`). Real data only: a stop exists because a
// feature declared it (proved by its test) or a registered screen names it.

import Link from "next/link";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResolvedPlace } from "./types";

export function PlacesMap({
  places,
  activeMandateKey,
  activePlaceId,
  onHoverPlace,
}: {
  places: readonly ResolvedPlace[];
  activeMandateKey: string | null;
  activePlaceId: string | null;
  onHoverPlace: (placeId: string | null) => void;
}) {
  if (places.length === 0) return null;
  return (
    <div>
      <ol
        className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:items-stretch"
        aria-label="Where intelligence runs"
      >
        {places.map((place) => {
          const lit =
            (activeMandateKey !== null &&
              place.mandateKeys.includes(activeMandateKey)) ||
            activePlaceId === place.id;
          const dim = activeMandateKey !== null && !lit;
          const inner = (
            <>
              <span className="flex items-center gap-1 text-[12px] font-medium text-foreground">
                <MapPin
                  className={cn(
                    "h-3 w-3 shrink-0",
                    lit ? "text-primary" : "text-muted-foreground",
                  )}
                  aria-hidden
                />
                <span className="truncate">{place.label}</span>
                <span className="ml-auto pl-2 text-[10px] tabular-nums text-muted-foreground">
                  {place.mandateKeys.length}
                </span>
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {place.trigger}
              </span>
            </>
          );
          const className = cn(
            "block h-full w-full min-w-0 rounded-lg border px-2.5 py-1.5 text-left transition-all sm:w-[11.5rem]",
            lit
              ? "border-primary/60 bg-primary/10 shadow-sm"
              : "border-border bg-card hover:border-primary/40",
            dim && "opacity-45",
            !place.href && "border-dashed",
          );
          return (
            <li
              key={place.id}
              onMouseEnter={() => onHoverPlace(place.id)}
              onMouseLeave={() => onHoverPlace(null)}
            >
              {place.href ? (
                <Link href={place.href} className={className}>
                  {inner}
                </Link>
              ) : (
                <span
                  className={className}
                  title={
                    place.urlPattern
                      ? "Open it from a specific record"
                      : undefined
                  }
                >
                  {inner}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
