/**
 * The Offerings vocabulary, in the business owner's words (USER.md: the
 * person ruling here is an expert in their business, never in SEO).
 *
 * The stored values are the `seo.site_offering_value` check constraints and
 * the `web.brand_offering.kind` constraint; the labels are what a person reads.
 */

export const OFFERING_KIND_META = [
  {
    value: "service",
    label: "A service you sell",
    meaning: "Someone searching for this can become a paying customer for work you do.",
  },
  {
    value: "product",
    label: "A product you sell",
    meaning: "Someone searching for this can become a paying customer for something you sell.",
  },
] as const;

export type OfferingKindValue = (typeof OFFERING_KIND_META)[number]["value"];

export function offeringKindLabel(kind: string): string {
  return OFFERING_KIND_META.find((entry) => entry.value === kind)?.label ?? kind;
}

/** `seo.site_offering_value.lead_quality`. */
export const LEAD_QUALITY_OPTIONS = [
  { value: "high_value", label: "The leads we want most" },
  { value: "medium_value", label: "Decent leads" },
  { value: "low_value", label: "Weak leads" },
  { value: "negative_value", label: "Leads we do not want", guard: true },
] as const;

/** `seo.site_offering_value.offering_match`. */
export const OFFERING_MATCH_OPTIONS = [
  { value: "core_offering", label: "This is what we do" },
  { value: "adjacent_offering", label: "Near what we do" },
  { value: "not_offered", label: "We do not offer this", guard: true },
  { value: "actively_avoided", label: "We turn this work away", guard: true },
] as const;

export function optionLabel(
  value: string | null | undefined,
  options: readonly { value: string; label: string }[],
): string {
  if (!value) return "Not said";
  return options.find((option) => option.value === value)?.label ?? value;
}

/** Points are the platform's worth scale (D9): signed, unbounded, from the baseline. */
export function formatPoints(points: number | null): string {
  if (points === null) return "—";
  const rounded = Number.isInteger(points) ? String(points) : points.toFixed(1);
  return points > 0 ? `+${rounded}` : rounded;
}
