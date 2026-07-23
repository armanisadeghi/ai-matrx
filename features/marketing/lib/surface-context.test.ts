import {
  buildBrandContextXml,
  buildSiteContextXml,
} from "@/features/marketing/lib/surface-context";
import type { SiteConnectionStatus } from "@/features/marketing/lib/site-status";
import type {
  BrandAsset,
  BrandProperty,
  BusinessFact,
  MarketingBrand,
  MarketingSite,
} from "@/features/marketing/types";
import { parseBrandProfile } from "@/features/marketing/types";
import type { Json } from "@/types/database.types";

// ---------------------------------------------------------------------------
// Fixtures — full generated Row shapes with overridable fields.
// ---------------------------------------------------------------------------

const NOW = "2026-07-22T10:00:00.000Z";

function makeBrand(overrides: Partial<MarketingBrand> = {}): MarketingBrand {
  return {
    id: "brand-1",
    organization_id: "org-1",
    created_at: NOW,
    created_by: null,
    updated_at: NOW,
    updated_by: null,
    deleted_at: null,
    version: 1,
    metadata: {},
    name: "Acme Recycling",
    description: null,
    website_url: null,
    logo_url: null,
    favicon_url: null,
    og_image_url: null,
    industry: null,
    notes: null,
    status: "active",
    visibility: "internal",
    profile: {},
    settings: {},
    ...overrides,
  };
}

function makeSite(overrides: Partial<MarketingSite> = {}): MarketingSite {
  return {
    id: "site-1",
    brand_id: "brand-1",
    organization_id: "org-1",
    created_at: NOW,
    created_by: null,
    updated_at: NOW,
    updated_by: null,
    deleted_at: null,
    version: 1,
    metadata: {},
    name: "Acme Main Site",
    description: null,
    domain: "acme.example",
    root_url: "https://acme.example",
    favicon_url: null,
    logo_url: null,
    og_image_url: null,
    homepage_screenshot_id: null,
    initialized_at: null,
    initialization: {},
    integrations: {},
    gsc_synced_at: null,
    gsc_sync: {},
    settings: {},
    status: "active",
    visibility: "internal",
    ...overrides,
  };
}

function makeFact(overrides: Partial<BusinessFact> = {}): BusinessFact {
  return {
    id: "fact-1",
    brand_id: "brand-1",
    organization_id: "org-1",
    created_at: NOW,
    created_by: null,
    updated_at: NOW,
    updated_by: null,
    deleted_at: null,
    confirmed_at: null,
    confirmed_by: null,
    version: 1,
    metadata: {},
    source: "manual",
    kind: "phone",
    label: null,
    value: { text: "(555) 010-2000" },
    ...overrides,
  };
}

function makeAsset(overrides: Partial<BrandAsset> = {}): BrandAsset {
  return {
    id: "asset-1",
    brand_id: "brand-1",
    organization_id: "org-1",
    created_at: NOW,
    created_by: null,
    updated_at: NOW,
    updated_by: null,
    deleted_at: null,
    confirmed_at: null,
    confirmed_by: null,
    version: 1,
    metadata: {},
    data: {},
    source: "manual",
    file_id: null,
    kind: "logo",
    title: "Primary logo",
    notes: null,
    is_primary: true,
    sort_order: 0,
    source_url: null,
    ...overrides,
  };
}

function makeProperty(overrides: Partial<BrandProperty> = {}): BrandProperty {
  return {
    id: "prop-1",
    brand_id: "brand-1",
    organization_id: "org-1",
    created_at: NOW,
    created_by: null,
    updated_at: NOW,
    updated_by: null,
    deleted_at: null,
    version: 1,
    metadata: {},
    connection: {},
    settings: {},
    site_id: null,
    kind: "instagram",
    url: "https://instagram.com/acme",
    handle: "@acme",
    display_name: null,
    status: "active",
    ...overrides,
  };
}

const FULL_PROFILE: Json = {
  audience: "Facility managers & sustainability leads",
  voice_tone: "Direct, practical, zero greenwashing",
  positioning: "The compliance-first e-waste partner",
  value_props: ["Certified destruction", "Same-week pickup"],
  offerings: ["ITAD", "Data destruction"],
  service_area: "Southern California",
  competitors: ["ERI", "Sims Lifecycle"],
  target_keywords: ["e-waste recycling los angeles"],
  content_guidelines: "Cite certifications; never promise \"free\" pickup",
  notes: "Client prefers <quarterly> case studies",
};

// ---------------------------------------------------------------------------
// parseBrandProfile
// ---------------------------------------------------------------------------

describe("parseBrandProfile", () => {
  it("returns {} for null/undefined/non-object/array input", () => {
    expect(parseBrandProfile(null)).toEqual({});
    expect(parseBrandProfile(undefined)).toEqual({});
    expect(parseBrandProfile("nope")).toEqual({});
    expect(parseBrandProfile([1, 2])).toEqual({});
  });

  it("drops non-conforming fields and empty values, keeps valid ones", () => {
    expect(
      parseBrandProfile({
        audience: "  Buyers ",
        voice_tone: 42,
        value_props: ["keep", "", 7, "  also keep "],
        offerings: [],
        competitors: "not-an-array",
        unknown_field: "ignored",
      }),
    ).toEqual({
      audience: "Buyers",
      value_props: ["keep", "also keep"],
    });
  });
});

// ---------------------------------------------------------------------------
// buildBrandContextXml
// ---------------------------------------------------------------------------

describe("buildBrandContextXml", () => {
  it("escapes XML special characters in attributes and text", () => {
    const xml = buildBrandContextXml({
      brand: makeBrand({
        name: 'Q&A "Experts" <LLC>',
        description: "We do <fast> & \"clean\" work",
      }),
    });
    expect(xml).toContain('name="Q&amp;A &quot;Experts&quot; &lt;LLC&gt;"');
    expect(xml).toContain(
      "<description>We do &lt;fast&gt; &amp; &quot;clean&quot; work</description>",
    );
    expect(xml).not.toMatch(/<LLC>/);
  });

  it("omits the profile block entirely when the profile is empty", () => {
    const xml = buildBrandContextXml({ brand: makeBrand({ profile: {} }) });
    expect(xml).not.toContain("<profile>");
    // Junk-only profile is also treated as empty.
    const junk = buildBrandContextXml({
      brand: makeBrand({ profile: { audience: "", value_props: [3] } }),
    });
    expect(junk).not.toContain("<profile>");
  });

  it("omits empty sections and industry/website attrs when absent", () => {
    const xml = buildBrandContextXml({ brand: makeBrand() });
    expect(xml).toBe('<brand id="brand-1" name="Acme Recycling" status="active"></brand>');
  });

  it("renders a full brand with profile, facts, assets, properties, and sites", () => {
    const xml = buildBrandContextXml({
      brand: makeBrand({
        industry: "Electronics recycling",
        website_url: "https://acme.example",
        description: "E-waste done right.",
        profile: FULL_PROFILE,
      }),
      facts: [
        makeFact(),
        makeFact({ id: "fact-2", kind: "service_area", label: "Coverage", value: { text: "SoCal" } }),
      ],
      assets: [makeAsset(), makeAsset({ id: "asset-2", kind: "favicon", title: null, is_primary: false })],
      properties: [makeProperty(), makeProperty({ id: "prop-2", kind: "youtube", url: null, handle: null })],
      sites: [makeSite()],
    });

    expect(xml).toContain(
      '<brand id="brand-1" name="Acme Recycling" industry="Electronics recycling" website="https://acme.example" status="active">',
    );
    expect(xml).toContain("<description>E-waste done right.</description>");
    // Authored profile: string fields as elements, lists as <item> children.
    expect(xml).toContain("<audience>Facility managers &amp; sustainability leads</audience>");
    expect(xml).toContain(
      "<value_props><item>Certified destruction</item><item>Same-week pickup</item></value_props>",
    );
    expect(xml).toContain("<notes>Client prefers &lt;quarterly&gt; case studies</notes>");
    // Facts carry kind (+ label when present) and the extracted value text.
    expect(xml).toContain('<fact kind="phone">(555) 010-2000</fact>');
    expect(xml).toContain('<fact kind="service_area" label="Coverage">SoCal</fact>');
    // Assets: is_primary only when true, title only when present.
    expect(xml).toContain('<asset kind="logo" title="Primary logo" is_primary="true"/>');
    expect(xml).toContain('<asset kind="favicon"/>');
    // Properties: url/handle only when present.
    expect(xml).toContain('<property kind="instagram" url="https://instagram.com/acme" handle="@acme"/>');
    expect(xml).toContain('<property kind="youtube"/>');
    expect(xml).toContain(
      '<site id="site-1" name="Acme Main Site" root_url="https://acme.example" status="active"/>',
    );
    expect(xml.endsWith("</brand>")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildSiteContextXml
// ---------------------------------------------------------------------------

const STATUSES: SiteConnectionStatus[] = [
  { key: "initialized", label: "Init", name: "Site initialized", state: "connected", detail: "" },
  { key: "search_console", label: "GSC", name: "Google Search Console", state: "attention", detail: "" },
  { key: "analytics", label: "GA4", name: "Google Analytics 4", state: "off", detail: "" },
  { key: "pagespeed", label: "PSI", name: "PageSpeed Insights", state: "connected", detail: "" },
  { key: "cms", label: "CMS", name: "CMS connection", state: "off", detail: "" },
];

describe("buildSiteContextXml", () => {
  it("renders identity only when nothing else is known", () => {
    const xml = buildSiteContextXml({ site: makeSite() });
    expect(xml).toBe(
      '<site id="site-1" name="Acme Main Site" root_url="https://acme.example" domain="acme.example" status="active"></site>',
    );
  });

  it("renders statuses, initialization, counts, and last crawl", () => {
    const xml = buildSiteContextXml({
      site: makeSite({
        description: "Primary marketing site",
        initialized_at: "2026-07-01T00:00:00.000Z",
      }),
      statuses: STATUSES,
      counts: { pages_total: 128, open_findings: 7, sitemaps: 3 },
      lastCrawlAt: "2026-07-20T12:00:00.000Z",
    });

    expect(xml).toContain("<description>Primary marketing site</description>");
    expect(xml).toContain(
      '<connections init="connected" gsc="attention" ga4="off" psi="connected" cms="off"/>',
    );
    expect(xml).toContain('<initialization initialized_at="2026-07-01T00:00:00.000Z"/>');
    expect(xml).toContain('<counts pages="128" findings="7" sitemaps="3"/>');
    expect(xml).toContain('<last_crawl at="2026-07-20T12:00:00.000Z"/>');
  });

  it("omits count attributes that were not supplied, including zero-valued ones passed explicitly", () => {
    const xml = buildSiteContextXml({
      site: makeSite(),
      counts: { pages_total: 0 },
    });
    expect(xml).toContain('<counts pages="0"/>');
    expect(xml).not.toContain("findings=");
    expect(xml).not.toContain("sitemaps=");
  });
});
