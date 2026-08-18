import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";

/** Flat observed payload returned by the live Google listing check (aidream). */
export interface GoogleListingSnapshot {
  found: boolean;
  keyword: string;
  name?: string | null;
  street_address?: string | null;
  locality?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
  phone?: string | null;
  website_url?: string | null;
  place_id?: string | null;
  cid?: string | null;
  rating?: number | null;
  rating_count?: number | null;
  category?: string | null;
}

export interface GoogleListingCheckResult {
  location_id: string;
  listing_id: string | null;
  snapshot: GoogleListingSnapshot;
  listing_status: string;
  persisted: boolean;
}

/**
 * Fetch the location's LIVE public Google listing via aidream (DataForSEO
 * Business Data) and persist it as observed evidence — the NAP audit then runs
 * against real extracted data. ~$0.005 per check; the server remembers the
 * listing's Google cid after the first hit so refreshes are deterministic.
 */
export async function checkGoogleListing(
  locationId: string,
  dispatch: AppDispatch,
  options?: { keywordOverride?: string; forceRefresh?: boolean },
): Promise<GoogleListingCheckResult> {
  const result = await dispatch(
    callApi({
      path: "/seo/local/locations/{location_id}/google-listing",
      method: "POST",
      pathParams: { location_id: locationId },
      body: {
        force_refresh: options?.forceRefresh ?? false,
        keyword_override: options?.keywordOverride ?? null,
      },
    }),
  );
  if (result.error) {
    throw new Error(result.error.message ?? "Google listing check failed");
  }
  return result.data as unknown as GoogleListingCheckResult;
}
