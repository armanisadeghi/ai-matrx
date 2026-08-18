import {
  auditListingNap,
  computeCitationCoverage,
  findProfileGaps,
  normalizePhone,
  normalizeStreetAddress,
  normalizeWebsiteUrl,
} from "@/features/marketing/lib/local-listings-audit";
import { buildListingMatrix } from "@/features/marketing/data/service";
import {
  buildLocalBusinessJsonLd,
  buildOpeningHoursSpecifications,
  localBusinessJsonLdScript,
} from "@/features/marketing/lib/local-business-jsonld";
import type { BusinessLocation, ListingPublisher, LocationListing } from "@/features/marketing/types";

function makeLocation(overrides: Partial<BusinessLocation> = {}): BusinessLocation {
  return {
    id: "loc-1",
    organization_id: "org-1",
    brand_id: "brand-1",
    name: "Titanium Success — Costa Mesa",
    status: "active",
    is_primary: true,
    street_address: "3151 Airway Avenue",
    address_line2: "Suite F-110",
    locality: "Costa Mesa",
    region: "CA",
    postal_code: "92626",
    country_code: "US",
    phone: "+1 714 555 0134",
    email: "hello@example.com",
    website_url: "https://titaniumsuccess.com/locations/costa-mesa",
    latitude: 33.6846,
    longitude: -117.8265,
    business_type: "ProfessionalService",
    categories: ["Business coach"],
    opening_hours: [
      { day: "monday", opens: "09:00", closes: "17:00" },
      { day: "tuesday", opens: "09:00", closes: "17:00" },
      { day: "saturday", closed: true },
    ],
    special_hours: [],
    attributes: {},
    identifiers: {},
    description: "Executive coaching firm.",
    created_at: "2026-08-18T00:00:00Z",
    updated_at: "2026-08-18T00:00:00Z",
    created_by: null,
    updated_by: null,
    deleted_at: null,
    version: 1,
    metadata: {},
    ...overrides,
  };
}

function makePublisher(overrides: Partial<ListingPublisher> = {}): ListingPublisher {
  return {
    id: "pub-1",
    slug: "google-business-profile",
    name: "Google Business Profile",
    domain: "google.com",
    tier: "critical",
    is_aggregator: false,
    api_access: "approval",
    api_notes: null,
    manage_url: null,
    categories: [],
    citation_weight: 100,
    sort_rank: 10,
    visibility: "public",
    organization_id: "org-sys",
    created_at: "2026-08-18T00:00:00Z",
    updated_at: "2026-08-18T00:00:00Z",
    created_by: null,
    updated_by: null,
    deleted_at: null,
    version: 1,
    metadata: {},
    ...overrides,
  } as ListingPublisher;
}

function makeListing(overrides: Partial<LocationListing> = {}): LocationListing {
  return {
    id: "listing-1",
    organization_id: "org-1",
    location_id: "loc-1",
    publisher_id: "pub-1",
    status: "listed",
    listing_url: null,
    observed: {},
    nap_match: null,
    match_score: null,
    last_checked_at: null,
    source: "manual",
    notes: null,
    created_at: "2026-08-18T00:00:00Z",
    updated_at: "2026-08-18T00:00:00Z",
    created_by: null,
    updated_by: null,
    deleted_at: null,
    version: 1,
    metadata: {},
    ...overrides,
  } as LocationListing;
}

describe("NAP normalization", () => {
  it("treats street synonyms and punctuation as equal", () => {
    expect(normalizeStreetAddress("3151 Airway Ave., Suite F-110")).toBe(
      normalizeStreetAddress("3151 Airway Avenue Ste F 110"),
    );
  });

  it("treats formatting-only phone differences as equal, including +1", () => {
    expect(normalizePhone("+1 (714) 555-0134")).toBe(normalizePhone("714.555.0134"));
  });

  it("ignores protocol, www and trailing slash on URLs", () => {
    expect(normalizeWebsiteUrl("https://www.Example.com/page/")).toBe(normalizeWebsiteUrl("http://example.com/page"));
  });
});

describe("auditListingNap", () => {
  it("scores 100 when the observed payload matches after normalization", () => {
    const audit = auditListingNap(makeLocation(), {
      name: "TITANIUM SUCCESS - COSTA MESA",
      street_address: "3151 Airway Ave",
      locality: "Costa Mesa",
      region: "ca",
      postal_code: "92626",
      phone: "(714) 555-0134",
      website_url: "titaniumsuccess.com/locations/costa-mesa",
    });
    expect(audit.score).toBe(100);
    expect(audit.mismatches).toHaveLength(0);
  });

  it("flags a real mismatch (old address) and reports both values", () => {
    const audit = auditListingNap(makeLocation(), {
      street_address: "100 Old Road",
      phone: "(714) 555-0134",
    });
    const streetVerdict = audit.verdicts.find((v) => v.field === "street_address");
    expect(streetVerdict?.verdict).toBe("mismatch");
    expect(streetVerdict?.canonical).toBe("3151 Airway Avenue");
    expect(streetVerdict?.observed).toBe("100 Old Road");
    expect(audit.mismatches).toHaveLength(1);
    expect(audit.score).toBeLessThan(100);
  });

  it("returns null score when nothing is comparable", () => {
    expect(auditListingNap(makeLocation(), {}).score).toBeNull();
  });
});

describe("computeCitationCoverage", () => {
  it("weights coverage by citation_weight and ranks missing publishers by impact", () => {
    const google = makePublisher({ id: "pub-google", citation_weight: 100 });
    const manta = makePublisher({ id: "pub-manta", slug: "manta", name: "Manta", tier: "long_tail", citation_weight: 25 });
    const yelp = makePublisher({ id: "pub-yelp", slug: "yelp", name: "Yelp", citation_weight: 85 });
    const matrix = buildListingMatrix(
      [google, manta, yelp],
      [makeListing({ publisher_id: "pub-google", status: "claimed" })],
    );
    const coverage = computeCitationCoverage(matrix);
    expect(coverage.presentCount).toBe(1);
    expect(coverage.totalPublishers).toBe(3);
    expect(coverage.score).toBe(Math.round((100 / 210) * 100));
    expect(coverage.missing.map((p) => p.name)).toEqual(["Yelp", "Manta"]);
  });

  it("surfaces needs_update and rejected listings as attention items", () => {
    const google = makePublisher({ id: "pub-google" });
    const yelp = makePublisher({ id: "pub-yelp", slug: "yelp", name: "Yelp", citation_weight: 85 });
    const coverage = computeCitationCoverage(
      buildListingMatrix(
        [google, yelp],
        [
          makeListing({ publisher_id: "pub-google", status: "needs_update" }),
          makeListing({ id: "listing-2", publisher_id: "pub-yelp", status: "rejected" }),
        ],
      ),
    );
    expect(coverage.attention).toHaveLength(2);
    // needs_update still counts as present; rejected does not.
    expect(coverage.presentCount).toBe(1);
  });
});

describe("findProfileGaps", () => {
  it("finds nothing on a complete profile", () => {
    expect(findProfileGaps(makeLocation())).toHaveLength(0);
  });

  it("names every missing submission-blocking field", () => {
    const gaps = findProfileGaps(
      makeLocation({ phone: null, opening_hours: [], categories: [], latitude: null }),
    );
    expect(gaps.map((gap) => gap.field)).toEqual(
      expect.arrayContaining(["phone", "opening_hours", "categories", "latitude"]),
    );
  });
});

describe("LocalBusiness JSON-LD", () => {
  it("emits the subtype, full postal address, geo and grouped hours", () => {
    const jsonLd = buildLocalBusinessJsonLd(makeLocation(), {
      brandName: "Titanium Success",
      sameAs: ["https://www.facebook.com/titaniumsuccess"],
    });
    expect(jsonLd["@type"]).toBe("ProfessionalService");
    expect(jsonLd.address).toMatchObject({
      "@type": "PostalAddress",
      streetAddress: "3151 Airway Avenue, Suite F-110",
      addressLocality: "Costa Mesa",
      addressRegion: "CA",
      postalCode: "92626",
      addressCountry: "US",
    });
    expect(jsonLd.geo).toMatchObject({ latitude: 33.6846, longitude: -117.8265 });
    expect(jsonLd.openingHoursSpecification).toEqual([
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday"], opens: "09:00", closes: "17:00" },
    ]);
    expect(jsonLd.parentOrganization).toMatchObject({ name: "Titanium Success" });
    expect(jsonLd.sameAs).toEqual(["https://www.facebook.com/titaniumsuccess"]);
  });

  it("falls back to LocalBusiness and omits empty branches", () => {
    const jsonLd = buildLocalBusinessJsonLd(
      makeLocation({
        business_type: null,
        street_address: null,
        address_line2: null,
        locality: null,
        region: null,
        postal_code: null,
        country_code: null,
        latitude: null,
        longitude: null,
        opening_hours: [],
      }),
    );
    expect(jsonLd["@type"]).toBe("LocalBusiness");
    expect(jsonLd.address).toBeUndefined();
    expect(jsonLd.geo).toBeUndefined();
    expect(jsonLd.openingHoursSpecification).toBeUndefined();
  });

  it("groups only open days and skips closed ones", () => {
    expect(
      buildOpeningHoursSpecifications([
        { day: "monday", opens: "09:00", closes: "17:00" },
        { day: "saturday", closed: true },
      ]),
    ).toHaveLength(1);
  });

  it("wraps the payload in a script tag", () => {
    const script = localBusinessJsonLdScript(buildLocalBusinessJsonLd(makeLocation()));
    expect(script.startsWith('<script type="application/ld+json">')).toBe(true);
    expect(script.endsWith("</script>")).toBe(true);
  });
});

describe("findLocalBusinessJsonLd", () => {
  const { findLocalBusinessJsonLd } = jest.requireActual<
    typeof import("@/features/marketing/lib/local-business-jsonld")
  >("@/features/marketing/lib/local-business-jsonld");

  it("finds a LocalBusiness node inside an @graph and extracts flat NAP", () => {
    const found = findLocalBusinessJsonLd([
      {
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "WebSite", name: "Site" },
          {
            "@type": "MedicalClinic",
            name: "Clinic",
            telephone: "+1 714 555 0134",
            address: { "@type": "PostalAddress", streetAddress: "3151 Airway Ave", addressLocality: "Costa Mesa" },
          },
        ],
      },
    ]);
    expect(found?.types).toEqual(["MedicalClinic"]);
    expect(found?.observed).toMatchObject({
      name: "Clinic",
      phone: "+1 714 555 0134",
      street_address: "3151 Airway Ave",
      locality: "Costa Mesa",
    });
  });

  it("returns null when only non-business types are declared", () => {
    expect(findLocalBusinessJsonLd([{ "@type": "Article", name: "Post" }])).toBeNull();
  });

  it("counts any *Business subtype", () => {
    expect(findLocalBusinessJsonLd([{ "@type": "DryCleaningBusiness", name: "X" }])?.types).toEqual([
      "DryCleaningBusiness",
    ]);
  });
});
