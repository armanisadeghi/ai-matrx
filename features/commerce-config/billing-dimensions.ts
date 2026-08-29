/**
 * features/commerce-config/billing-dimensions.ts
 *
 * W11 — the seeded billable dimensions of the commerce product. This is the
 * ONE list future billing work consumes when wiring `billing.capability` /
 * `billing.plan_limit` rows for commerce (per the limits-are-knobs law those
 * rows are the enforcement mechanism; this module only names the dimensions
 * so no surface or plan invents a second vocabulary). Deliberately minimal.
 */

export interface CommerceBillingDimension {
  /** The `billing.capability` key this dimension will meter under. */
  capability: string;
  label: string;
  /** What ONE unit of the meter counts. */
  unit: string;
  description: string;
}

export const COMMERCE_BILLING_DIMENSIONS: readonly CommerceBillingDimension[] = [
  {
    capability: "commerce.items_processed",
    label: "Items processed",
    unit: "intake asset",
    description:
      "One intake asset run through the pipeline (capture → valuation), regardless of outcome.",
  },
  {
    capability: "commerce.listings_published",
    label: "Listings published",
    unit: "published listing",
    description:
      "One listing successfully published to a connected marketplace store.",
  },
  {
    capability: "commerce.storage",
    label: "Media storage",
    unit: "GB-month",
    description:
      "Captured photos, video and audio artifacts retained in the org's file tree.",
  },
] as const;
