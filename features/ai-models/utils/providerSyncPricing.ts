/**
 * providerSyncPricing — what we charge for a provider model, what the provider
 * says it charges, and how stale our number is.
 *
 * Three facts the Provider Sync table has to tell the truth about, per row:
 *
 *  1. OUR price — tier 0 of the priority-0 (preferred) `ai.offering` for the
 *     model the provider entry resolves to. `ai.offering.pricing[n].*_price`
 *     is already denominated per 1M units of the tier's `usage_basis`, so no
 *     conversion happens on our side.
 *  2. STALENESS — `ai.offering.pricing_verified_at` (aidream, 2026-09-11):
 *     when someone last confirmed the number against the provider. An offering
 *     with no timestamp reads "never verified"; nothing here ever wears a
 *     reassuring badge it cannot back up.
 *  3. THEIR price — Groq's `/v1/models` payload carries a `pricing` object
 *     (`prompt` / `completion` / `input_cache_read`) in dollars PER TOKEN as
 *     strings. Multiplied by 1e6 it is directly comparable to ours, so a
 *     drifted number is a mismatch we can show with both sides visible.
 *
 * No silent blanks: every row lands on exactly one honest state —
 * `no_offering`, `no_price`, or `priced`.
 */

import type { AiOffering, PricingTier, ProviderModelEntry } from "../types";

/** Dollars per 1M units of the offering's usage basis. */
export type PerMTokPrice = {
  input: number | null;
  output: number | null;
  cached: number | null;
};

export type PricingState = "no_offering" | "no_price" | "priced";

export type PriceMismatch = {
  field: "input" | "output" | "cached";
  ours: number | null;
  theirs: number | null;
};

export type VerificationState =
  /** Nobody has ever confirmed this offering's price against the provider. */
  | "never"
  /** `pricing_verified_at` carries a timestamp. */
  | "verified";

export type ProviderSyncRowPricing = {
  state: PricingState;
  ours: PerMTokPrice | null;
  usage_basis: string | null;
  verification: VerificationState;
  verified_at: string | null;
  /** Provider-published price, when the provider publishes one (Groq today). */
  theirs: PerMTokPrice | null;
  /** Non-empty only when both sides have a comparable number and they differ. */
  mismatches: PriceMismatch[];
};

export const PRICING_NOT_APPLICABLE: ProviderSyncRowPricing = {
  state: "no_offering",
  ours: null,
  usage_basis: null,
  verification: "never",
  verified_at: null,
  theirs: null,
  mismatches: [],
};

/** When this offering's price was last confirmed against the provider. */
export function readPricingVerifiedAt(offering: AiOffering): string | null {
  return offering.pricing_verified_at;
}

function tierToPrice(tier: PricingTier | undefined): PerMTokPrice | null {
  if (!tier) return null;
  const price: PerMTokPrice = {
    input: tier.input_price,
    output: tier.output_price,
    cached: tier.cached_input_price,
  };
  if (price.input == null && price.output == null && price.cached == null) {
    return null;
  }
  return price;
}

/** The offering that actually bills: lowest `priority` wins (ties → oldest id). */
export function preferredOffering(
  offerings: AiOffering[],
): AiOffering | undefined {
  if (offerings.length === 0) return undefined;
  return [...offerings].sort(
    (a, b) => (a.priority ?? 0) - (b.priority ?? 0) || a.id.localeCompare(b.id),
  )[0];
}

function parseDollarsPerToken(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Groq publishes per-token dollars on each `/v1/models` entry. Returns null for
 * every provider that publishes nothing, which is every other provider today —
 * the UI then shows no comparison rather than inventing one.
 */
export function extractProviderPublishedPrice(
  entry: ProviderModelEntry | null | undefined,
): PerMTokPrice | null {
  const pricing = entry?.pricing;
  if (!pricing || typeof pricing !== "object" || Array.isArray(pricing)) {
    return null;
  }
  const p = pricing as Record<string, unknown>;
  const perToken = {
    input: parseDollarsPerToken(p.prompt ?? p.input),
    output: parseDollarsPerToken(p.completion ?? p.output),
    cached: parseDollarsPerToken(p.input_cache_read ?? p.cached_input),
  };
  if (
    perToken.input == null &&
    perToken.output == null &&
    perToken.cached == null
  ) {
    return null;
  }
  const toMTok = (n: number | null) => (n == null ? null : n * 1_000_000);
  return {
    input: toMTok(perToken.input),
    output: toMTok(perToken.output),
    cached: toMTok(perToken.cached),
  };
}

/**
 * Prices differ when they differ by more than a hundredth of a cent per MTok.
 * Tighter than that is float noise from the per-token → per-MTok conversion,
 * not a real drift, and a table full of phantom mismatch markers teaches
 * people to ignore the marker.
 */
const PRICE_EPSILON = 0.0001;

export function comparePrices(
  ours: PerMTokPrice | null,
  theirs: PerMTokPrice | null,
): PriceMismatch[] {
  if (!ours || !theirs) return [];
  const fields: PriceMismatch["field"][] = ["input", "output", "cached"];
  const out: PriceMismatch[] = [];
  for (const field of fields) {
    const a = ours[field];
    const b = theirs[field];
    // One side silent about a direction is not a disagreement about it.
    if (a == null || b == null) continue;
    if (Math.abs(a - b) > PRICE_EPSILON) {
      out.push({ field, ours: a, theirs: b });
    }
  }
  return out;
}

export function buildRowPricing(
  offerings: AiOffering[],
  providerEntry: ProviderModelEntry | null | undefined,
): ProviderSyncRowPricing {
  const theirs = extractProviderPublishedPrice(providerEntry);
  const preferred = preferredOffering(offerings);

  if (!preferred) {
    return { ...PRICING_NOT_APPLICABLE, theirs };
  }

  const verified_at = readPricingVerifiedAt(preferred);
  const verification: VerificationState = verified_at ? "verified" : "never";

  const ours = tierToPrice(preferred.pricing[0]);
  if (!ours) {
    return {
      state: "no_price",
      ours: null,
      usage_basis: preferred.usage_basis,
      verification,
      verified_at,
      theirs,
      mismatches: [],
    };
  }

  return {
    state: "priced",
    ours,
    usage_basis: preferred.usage_basis,
    verification,
    verified_at,
    theirs,
    mismatches: comparePrices(ours, theirs),
  };
}

/** Whole days since `iso`, or null when there is no timestamp to age. */
export function ageInDays(
  iso: string | null | undefined,
  now: number = Date.now(),
): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

export function formatPerMTok(value: number | null): string {
  if (value == null) return "—";
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}
