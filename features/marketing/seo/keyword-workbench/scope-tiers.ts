/**
 * THE PLACEMENT LADDER — the ONE vocabulary for `seo.keyword_topic.scope_tier`.
 *
 * A keyword's Offering is decided on a ladder: site > brand > organization >
 * system, nearest rung wins (`seo.keyword_placement_resolve`). Almost every
 * placement in the product today was decided ABOVE the person reading it —
 * 15,008 rows at the platform tier, 1,324 at an organization, 2 at a site (1 primary, 1 demoted)
 * (live count, 2026-09-12) — so the rung is not a detail: it is the difference
 * between "I decided this" and "someone else decided this for me".
 *
 * These words live here, once, because three surfaces now say them (the
 * Offering cell's inherited marker, the keyword dossier, and the opt-in diff
 * queue) and a second spelling is how two screens start describing the same
 * row differently.
 *
 * NOT the same ladder as `seo.engine_schedule.scope_tier`
 * (`run-console/ScheduleCascadePanel.tsx`'s `tierLabel`): that table has no
 * brand rung and its `site` row is the one a BRAND console authors, so it
 * reads "Brand" where this ladder reads "this site". Two tables, two ladders,
 * two vocabularies — deliberately not merged.
 */

export const PLACEMENT_SCOPE_TIERS = [
  "site",
  "brand",
  "organization",
  "system",
] as const;

export type PlacementScopeTier = (typeof PLACEMENT_SCOPE_TIERS)[number];

export function isPlacementScopeTier(
  value: string | null | undefined,
): value is PlacementScopeTier {
  return (
    value != null &&
    (PLACEMENT_SCOPE_TIERS as readonly string[]).includes(value)
  );
}

/**
 * A rung named as a thing a sentence can point at: "… moved in the platform
 * default". Lifted out of `PlacementDiffQueue` on 2026-09-12, unchanged.
 */
export const SCOPE_TIER_LABEL: Record<string, string> = {
  site: "this site's own ruling",
  brand: "the brand default",
  organization: "the organization default",
  system: "the platform default",
};

/** WHO decided, for a sentence that names them. */
export const SCOPE_TIER_SOURCE: Record<PlacementScopeTier, string> = {
  site: "this site",
  brand: "the brand",
  organization: "your organization",
  system: "the platform",
};

/** The headline of the marker's explanation — never a bare tier token. */
export const SCOPE_TIER_HEADLINE: Record<PlacementScopeTier, string> = {
  site: "This site placed it",
  brand: "The brand placed it",
  organization: "Your organization placed it",
  system: "The platform placed it",
};

/**
 * One sentence saying what the rung MEANS for the person reading it — why the
 * placement is there and who else it applies to.
 */
export const SCOPE_TIER_MEANING: Record<PlacementScopeTier, string> = {
  site: "This placement belongs to this site alone.",
  brand:
    "Every site in this brand inherits this placement until a site rules otherwise.",
  organization:
    "Every site in your organization inherits this placement until a site rules otherwise.",
  system:
    "This is the placement AI Matrx ships for this keyword. Every site that has not ruled on it inherits it.",
};

/** True when the rung is ABOVE the site — the only case that earns a marker. */
export function isInheritedTier(
  tier: string | null | undefined,
): tier is Exclude<PlacementScopeTier, "site"> {
  return isPlacementScopeTier(tier) && tier !== "site";
}
