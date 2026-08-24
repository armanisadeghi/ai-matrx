"use client";

/**
 * WHICH LOCATION, AND HOW WE DECIDED — one line, inside the value receipt.
 *
 * P16 makes "which location" part of what a local keyword MEANS, so it belongs
 * in the receipt beside every other reason, not in a separate report. And it is
 * never stated bare: "Irvine HQ" alone is a claim. "Irvine HQ — because the
 * search names Irvine" is a claim the reader can check, disagree with, and go
 * fix (by binding the area, or by correcting the location's city).
 *
 * ABSENT IS A REAL ANSWER. `seo.gsc_keyword_locations` omits a keyword it
 * cannot place, and this line says so plainly rather than inventing a default —
 * that omission is the honest half of the whole C10 design.
 *
 * Renders nothing at all when the keyword names no place: telling somebody that
 * "seo agency pricing" has no location is noise in every receipt on the site.
 */

import { useQuery } from "@tanstack/react-query";
import { Building2, MapPinOff } from "lucide-react";
import Link from "next/link";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { getKeywordLocations, keywordLocationsQueryKey } from "./data";
import { explainDecidedBy } from "./types";

export function KeywordLocationLine({
  siteId,
  brandId,
  keywordId,
  /**
   * True when this keyword names a place at all. Only then is "no location"
   * worth reporting — otherwise the line stays silent.
   */
  isLocal = null,
}: {
  siteId: string;
  brandId?: string | null;
  keywordId: string;
  isLocal?: boolean | null;
}) {
  const located = useQuery({
    queryKey: keywordLocationsQueryKey(siteId, [keywordId]),
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => getKeywordLocations(siteId, [keywordId], signal),
  });

  // Silent while unknown: a receipt that flickers a wrong answer then corrects
  // itself is worse than one that fills in a beat later.
  if (!located.data) return null;
  const row = located.data.get(keywordId) ?? null;

  if (!row) {
    if (isLocal !== true) return null;
    return (
      <p className="flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground">
        <MapPinOff className="mt-px h-3 w-3 shrink-0 text-warning" aria-hidden />
        <span>
          This is a local search, but nothing yet says which location it belongs
          to.
          {brandId ? (
            <>
              {" "}
              <Link
                href={marketingRoutes.brandLocal(brandId)}
                className="text-primary hover:underline"
              >
                Check your locations
              </Link>
              .
            </>
          ) : null}
        </span>
      </p>
    );
  }

  const place = [row.locality, row.region].filter(Boolean).join(", ");
  return (
    <p className="flex items-start gap-1.5 text-[11px] leading-4 text-foreground">
      <Building2 className="mt-px h-3 w-3 shrink-0 text-primary" aria-hidden />
      <span>
        <span className="font-medium">{row.location_name}</span>
        {place ? (
          <span className="text-muted-foreground"> ({place})</span>
        ) : null}
        <span className="text-muted-foreground">
          {" — "}
          {explainDecidedBy(
            row.decided_by,
            row.place_name,
            row.distance_km === null ? null : Number(row.distance_km),
          )}
          .
        </span>
      </span>
    </p>
  );
}
