import type { BusinessLocation, OpeningHoursEntry } from "@/features/marketing/types";
import { readOpeningHours } from "@/features/marketing/types";

/**
 * schema.org LocalBusiness JSON-LD generator (pure, no I/O).
 *
 * Emits the structured data a location page should carry — the same output
 * class Yoast Local SEO sells, generated from the canonical
 * web.business_location profile so it can never drift from the record.
 * The subtype comes from business_type (plan.profile.schema_org_map maps
 * location pages to "LocalBusiness"; a concrete subtype always wins).
 */

const DAY_TO_SCHEMA: Record<OpeningHoursEntry["day"], string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

interface OpeningHoursSpecification {
  "@type": "OpeningHoursSpecification";
  dayOfWeek: string[];
  opens: string;
  closes: string;
}

/** Group identical open/close windows into one specification (schema.org best practice). */
export function buildOpeningHoursSpecifications(entries: OpeningHoursEntry[]): OpeningHoursSpecification[] {
  const byWindow = new Map<string, { days: string[]; opens: string; closes: string }>();
  for (const entry of entries) {
    if (entry.closed || !entry.opens || !entry.closes) continue;
    const key = `${entry.opens}-${entry.closes}`;
    const group = byWindow.get(key) ?? { days: [], opens: entry.opens, closes: entry.closes };
    group.days.push(DAY_TO_SCHEMA[entry.day]);
    byWindow.set(key, group);
  }
  return [...byWindow.values()].map((group) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: group.days,
    opens: group.opens,
    closes: group.closes,
  }));
}

export interface LocalBusinessJsonLd {
  "@context": "https://schema.org";
  "@type": string;
  name: string;
  [key: string]: unknown;
}

export function buildLocalBusinessJsonLd(
  location: BusinessLocation,
  options?: { brandName?: string | null; logoUrl?: string | null; sameAs?: string[] },
): LocalBusinessJsonLd {
  const jsonLd: LocalBusinessJsonLd = {
    "@context": "https://schema.org",
    "@type": location.business_type?.trim() || "LocalBusiness",
    name: location.name,
  };

  if (location.description) jsonLd.description = location.description;
  if (location.website_url) jsonLd.url = location.website_url;
  if (location.phone) jsonLd.telephone = location.phone;
  if (location.email) jsonLd.email = location.email;
  if (options?.logoUrl) jsonLd.image = options.logoUrl;
  if (options?.brandName && options.brandName !== location.name) {
    jsonLd.parentOrganization = { "@type": "Organization", name: options.brandName };
  }

  const address: Record<string, unknown> = { "@type": "PostalAddress" };
  if (location.street_address) {
    address.streetAddress = location.address_line2
      ? `${location.street_address}, ${location.address_line2}`
      : location.street_address;
  }
  if (location.locality) address.addressLocality = location.locality;
  if (location.region) address.addressRegion = location.region;
  if (location.postal_code) address.postalCode = location.postal_code;
  if (location.country_code) address.addressCountry = location.country_code;
  if (Object.keys(address).length > 1) jsonLd.address = address;

  if (location.latitude !== null && location.longitude !== null) {
    jsonLd.geo = {
      "@type": "GeoCoordinates",
      latitude: location.latitude,
      longitude: location.longitude,
    };
  }

  const hours = buildOpeningHoursSpecifications(readOpeningHours(location));
  if (hours.length > 0) jsonLd.openingHoursSpecification = hours;

  const sameAs = (options?.sameAs ?? []).filter((url) => url.trim() !== "");
  if (sameAs.length > 0) jsonLd.sameAs = sameAs;

  return jsonLd;
}

/** The copyable script tag for a location page. */
export function localBusinessJsonLdScript(jsonLd: LocalBusinessJsonLd): string {
  return `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>`;
}
