import { marketingRoutes } from "@/features/marketing/lib/routes";

/** A brand's socials page, or null for an organization-wide account (no brand to open). */
export function agencyBrandHref(row: { brandId: string | null }): string | null {
  return row.brandId ? marketingRoutes.brandSocials(row.brandId) : null;
}

/** The account's own page under its brand, or null when it has no brand or no cached profile. */
export function agencyAccountHref(row: { brandId: string | null; platform: string; profileId: string | null }): string | null {
  return row.brandId && row.profileId ? `${marketingRoutes.brandSocials(row.brandId)}/${row.platform}/${row.profileId}` : null;
}
