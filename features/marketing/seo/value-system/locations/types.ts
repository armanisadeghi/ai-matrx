/**
 * MULTI-LOCATION LOCAL (C10) — client types.
 *
 * P16: "companies that have multiple locations, the definition of local starts
 * to change. So it's not just about knowing that something's local. It's also
 * about knowing WHICH location that one belongs to."
 *
 * Every shape here is the server's, unchanged. Nothing in this module decides
 * which location a keyword belongs to — `seo.gsc_keyword_locations` does, by a
 * precedence walk, and a keyword with no answer is simply absent from it.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md § C10.
 */

import type { Database } from "@/types/database.types";

type SeoFunctions = Database["seo"]["Functions"];

export type KeywordLocationRow =
  SeoFunctions["gsc_keyword_locations"]["Returns"][number];
export type LocationSummaryRow =
  SeoFunctions["gsc_perf_location_summary"]["Returns"][number];
export type LocationReadinessRow =
  SeoFunctions["gsc_location_readiness"]["Returns"][number];
export type LocationKeywordRow =
  SeoFunctions["gsc_location_keywords"]["Returns"][number];

/** The two explicit buckets the summary names alongside the real locations. */
export type LocationBucket = "unresolved" | "not_local";

/** One row of the decomposition, addressed the way the drill-in read wants it. */
export interface LocationRowKey {
  locationId: string | null;
  bucket: LocationBucket | null;
}

/** `state` in `gsc_location_readiness`, ordered worst-first for display. */
export const READINESS_ORDER: Record<string, number> = {
  inert: 0,
  gap: 1,
  ok: 2,
};

/**
 * `decided_by` in the reader's words. This is the whole point of C10 being
 * visible: a location attributed to a keyword without saying HOW is a claim,
 * and a claim nobody can check is exactly what this product exists to replace.
 */
export function explainDecidedBy(
  decidedBy: string | null,
  placeName: string | null,
  distanceKm: number | null,
): string {
  switch (decidedBy) {
    case "bound_area":
      return placeName
        ? `because you bound the service area that covers ${placeName} to it`
        : "because you bound the service area that caught this search to it";
    case "place_match":
      return placeName
        ? `because the search names ${placeName}`
        : "because the search names its city";
    case "state_match":
      return placeName
        ? `because the search names ${placeName} and that is its state`
        : "because the search names its state";
    case "nearest_place":
      return placeName
        ? `because ${placeName} is the closest place to it${
            distanceKm === null ? "" : ` — ${distanceKm} km away`
          }`
        : "because it is the closest location to the place named";
    case "single_location":
      return "because this is a local search and the business has one location";
    case "unresolved":
      return "this is a local search, but nothing yet says which location it belongs to";
    case "not_local":
      return "no place is named in this search";
    default:
      return "";
  }
}

/** Short form for a chip: two or three words, never a sentence. */
export function decidedByChip(decidedBy: string | null): string {
  switch (decidedBy) {
    case "bound_area":
      return "you bound it";
    case "place_match":
      return "names the city";
    case "state_match":
      return "names the state";
    case "nearest_place":
      return "nearest location";
    case "single_location":
      return "only location";
    case "unresolved":
      return "unresolved";
    case "not_local":
      return "not local";
    default:
      return "—";
  }
}
