import type { BusinessFact, BusinessLocation, LocationListing } from "@/features/marketing/types";
import { isJsonRecord } from "@/features/marketing/types";

/**
 * WS1 — profile autofill (PLAN.md): a location's canonical profile populates
 * itself from data the platform already holds. Manual typing is the fallback,
 * never the flow. Pure functions; the human applies suggestions, we never
 * silently overwrite a field they filled.
 *
 * Source precedence per field: google (structured, live-extracted) →
 * site (crawled JSON-LD the business itself published) → facts (confirmed
 * brand facts, may be unstructured).
 */

export type AutofillField =
  | "street_address"
  | "locality"
  | "region"
  | "postal_code"
  | "country_code"
  | "phone"
  | "email"
  | "website_url";

export type AutofillSource = "google" | "site" | "facts";

export const AUTOFILL_SOURCE_LABELS: Record<AutofillSource, string> = {
  google: "live Google listing",
  site: "your website's structured data",
  facts: "confirmed brand facts",
};

export interface ProfileSuggestion {
  field: AutofillField;
  value: string;
  source: AutofillSource;
}

const FIELDS: AutofillField[] = [
  "street_address",
  "locality",
  "region",
  "postal_code",
  "country_code",
  "phone",
  "email",
  "website_url",
];

function textAt(record: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!record) return null;
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** Flatten the highest-signal observed payload from the location's listings (google first). */
export function observedFromListings(listings: LocationListing[]): Record<string, unknown> | null {
  const scored = listings
    .filter((listing) => isJsonRecord(listing.observed) && Object.keys(listing.observed).length > 0)
    .sort((a, b) => {
      const aScore = a.source === "dataforseo" ? 0 : 1;
      const bScore = b.source === "dataforseo" ? 0 : 1;
      return aScore - bScore;
    });
  return scored.length > 0 ? (scored[0].observed as Record<string, unknown>) : null;
}

/** Brand business facts → flat field candidates ({text}/{url} payloads, per factValuePayload). */
export function fieldsFromBusinessFacts(facts: BusinessFact[]): Record<string, string> {
  const out: Record<string, string> = {};
  const factText = (fact: BusinessFact): string | null => {
    if (!isJsonRecord(fact.value)) return null;
    return textAt(fact.value as Record<string, unknown>, "text") ?? textAt(fact.value as Record<string, unknown>, "url");
  };
  for (const fact of facts) {
    const value = factText(fact);
    if (!value) continue;
    if (fact.kind === "phone" && !out.phone) out.phone = value;
    if (fact.kind === "email" && !out.email) out.email = value;
    // A brand address fact is one unstructured string — offered for the street
    // field so a human confirms; structured sources outrank it.
    if (fact.kind === "address" && !out.street_address) out.street_address = value;
  }
  return out;
}

/**
 * Suggestions for every EMPTY profile field, best source first. Filled fields
 * are never suggested against — the human's data always outranks machines.
 */
export function buildProfileSuggestions(
  location: BusinessLocation,
  sources: {
    googleObserved?: Record<string, unknown> | null;
    siteObserved?: Record<string, string> | null;
    facts?: BusinessFact[];
  },
): ProfileSuggestion[] {
  const factFields = fieldsFromBusinessFacts(sources.facts ?? []);
  const suggestions: ProfileSuggestion[] = [];
  for (const field of FIELDS) {
    const current = location[field];
    if (typeof current === "string" && current.trim() !== "") continue;
    const google = textAt(sources.googleObserved ?? null, field);
    const site = sources.siteObserved ? (sources.siteObserved[field]?.trim() || null) : null;
    const fact = factFields[field] ?? null;
    const pick: [string, AutofillSource] | null = google
      ? [google, "google"]
      : site
        ? [site, "site"]
        : fact
          ? [fact, "facts"]
          : null;
    if (pick) suggestions.push({ field, value: pick[0], source: pick[1] });
  }
  return suggestions;
}
