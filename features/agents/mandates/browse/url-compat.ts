// features/agents/mandates/browse/url-compat.ts
//
// LEGACY DEEP-LINK SHIM — load-bearing, not a nicety. 25 MandateDoorLink call
// sites plus 4 hand-rolled hrefs across the app link to
// `/agents/mandates?feature=<domain>` (the pre-rework contract). The reworked
// list encodes filters in the canonical entity-list URL form
// (`?filters={"feature":{"kind":"select","values":[...]}}` — lib/entity-list/
// urlQuery.ts). This module maps the old form onto the new one so every old
// door lands on a REAL select filter instead of a text search.
//
// Semantic change, deliberate (Arman, 2026-08-26): `?feature=` used to be a
// substring search that also surfaced neighbouring mandates; a facet filter is
// strict. "Text search = podcast" was the thing being replaced.

import type { EntityFilters } from "@/lib/entity-list/types";

/** The canonical filters value for one feature domain. */
export function featureFilters(feature: string): EntityFilters {
  return { feature: { kind: "select", values: [feature] } };
}

/**
 * The canonical browse URL for a feature domain — what MandateDoorLink and
 * every feature door should emit.
 */
export function mandatesBrowseHref(feature?: string): string {
  if (!feature?.trim()) return "/agents/mandates";
  const filters = encodeURIComponent(JSON.stringify(featureFilters(feature.trim())));
  return `/agents/mandates?filters=${filters}`;
}

/**
 * Server-side normalization for the route: given the incoming searchParams,
 * return the URL to redirect to when the LEGACY `?feature=` form is present
 * (and the canonical `filters` param is not), else null.
 */
export function legacyFeatureRedirect(searchParams: {
  feature?: string | string[];
  filters?: string | string[];
}): string | null {
  const feature = Array.isArray(searchParams.feature)
    ? searchParams.feature[0]
    : searchParams.feature;
  const hasFilters = searchParams.filters !== undefined;
  if (!feature?.trim() || hasFilters) return null;
  return mandatesBrowseHref(feature);
}
