/**
 * endowment-offer-values.ts — the REAL location facts the Local Listings
 * workspace holds, named exactly as the `marketing.local_endowment`
 * provision declares them (aidream `services/mandates/client_mandates.py`).
 *
 * These are mapped-only offers (pass_by_name=False): the mandate door drops
 * them unless a binding's consumption map names them, so sending them never
 * changes what a current Holder receives. Absent facts are omitted — never
 * sent as "" or null.
 */

import { compactOfferValues } from "@/features/marketing/lib/offer-values";
import type {
  BusinessLocation,
  ListingMatrixRow,
} from "@/features/marketing/types";
import type { MarketingLocalEndowmentOffer } from "@/types/python-generated/provision-offers";

export type EndowmentLocationFacts = Partial<
  Pick<
    MarketingLocalEndowmentOffer,
    | "street_address"
    | "locality"
    | "region"
    | "postal_code"
    | "country_code"
    | "business_description"
    | "categories"
    | "website_url"
    | "phone"
    | "location_status"
    | "listing_presence"
  >
>;

/** One markdown line per directory publisher: listed (with status/URL) or not. */
export function listingPresenceMarkdown(
  matrix: readonly ListingMatrixRow[],
): string | undefined {
  if (matrix.length === 0) return undefined;
  return matrix
    .map(({ publisher, listing }) => {
      if (!listing) return `- ${publisher.name}: not listed`;
      return `- ${publisher.name}: ${listing.status}${
        listing.listing_url ? ` (${listing.listing_url})` : ""
      }`;
    })
    .join("\n");
}

export function endowmentLocationOfferValues(
  location: Pick<
    BusinessLocation,
    | "street_address"
    | "locality"
    | "region"
    | "postal_code"
    | "country_code"
    | "description"
    | "categories"
    | "website_url"
    | "phone"
    | "status"
  >,
  matrix: readonly ListingMatrixRow[],
): EndowmentLocationFacts {
  return compactOfferValues({
    street_address: location.street_address ?? undefined,
    locality: location.locality ?? undefined,
    region: location.region ?? undefined,
    postal_code: location.postal_code ?? undefined,
    country_code: location.country_code ?? undefined,
    business_description: location.description ?? undefined,
    categories: location.categories,
    website_url: location.website_url ?? undefined,
    phone: location.phone ?? undefined,
    location_status: location.status,
    listing_presence: listingPresenceMarkdown(matrix),
  } satisfies EndowmentLocationFacts);
}
