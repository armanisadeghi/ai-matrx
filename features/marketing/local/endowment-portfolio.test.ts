import {
  artifactPriority,
  artifactTaskDedupeKey,
  coerceEndowmentPortfolio,
  matchPlatformsToRegistry,
  normalizeDomain,
  normalizeSlug,
  platformSlug,
  toArtifactTask,
  toDiscoveredPublisher,
  type PortfolioArtifact,
  type PortfolioPlatform,
} from "@/features/marketing/local/endowment-portfolio";
import type { ListingPublisher } from "@/features/marketing/types";

function makePublisher(overrides: Partial<ListingPublisher> = {}): ListingPublisher {
  return {
    id: "pub-1",
    slug: "zenodo",
    name: "Zenodo",
    domain: "zenodo.org",
    tier: "high_value",
    is_aggregator: false,
    api_access: "open",
    api_notes: null,
    manage_url: null,
    categories: [],
    citation_weight: 60,
    sort_rank: 400,
    visibility: "public",
    organization_id: "org-sys",
    created_at: "2026-08-21T00:00:00Z",
    updated_at: "2026-08-21T00:00:00Z",
    created_by: null,
    updated_by: null,
    deleted_at: null,
    version: 1,
    metadata: {},
    ...overrides,
  } as ListingPublisher;
}

function makePlatform(overrides: Partial<PortfolioPlatform> = {}): PortfolioPlatform {
  return {
    name: "Zenodo",
    domain: "zenodo.org",
    suggested_slug: "zenodo",
    tier: "high_value",
    categories: ["research"],
    api_access_guess: "open",
    signup_url: "https://zenodo.org/signup",
    notes: "Free account; deposit a dataset and it mints a DOI.",
    endowment: "data",
    ...overrides,
  };
}

function makeArtifact(overrides: Partial<PortfolioArtifact> = {}): PortfolioArtifact {
  return {
    title: "Annual commodity-yield-per-ton dataset",
    endowment: "data",
    description: "Anonymized yield by material and month, published with a DOI.",
    effort_hours: 6,
    reference_class: "doi_citation",
    target_platforms: ["Zenodo"],
    ...overrides,
  };
}

describe("normalizeDomain", () => {
  it("strips scheme, www, port, path and trailing dot", () => {
    expect(normalizeDomain("https://WWW.Zenodo.org:443/deposit/new?x=1")).toBe("zenodo.org");
    expect(normalizeDomain("zenodo.org.")).toBe("zenodo.org");
    expect(normalizeDomain("http://user:pass@commons.wikimedia.org/wiki/Main")).toBe(
      "commons.wikimedia.org",
    );
  });

  it("keeps a meaningful subdomain that is not www", () => {
    expect(normalizeDomain("https://commons.wikimedia.org")).toBe("commons.wikimedia.org");
  });

  it("returns empty for empty input rather than a stray fragment", () => {
    expect(normalizeDomain("   ")).toBe("");
  });
});

describe("normalizeSlug", () => {
  it("kebab-cases, folds diacritics and trims separators", () => {
    expect(normalizeSlug("  Wikimedia Commons! ")).toBe("wikimedia-commons");
    expect(normalizeSlug("Café Directory")).toBe("cafe-directory");
  });

  it("falls back through name then domain when no slug is offered", () => {
    expect(platformSlug(makePlatform({ suggested_slug: "" }))).toBe("zenodo");
    expect(platformSlug(makePlatform({ suggested_slug: "", name: "!!!" }))).toBe("zenodo-org");
  });
});

describe("coerceEndowmentPortfolio", () => {
  const valid = {
    business_read: "A certified recycler with real operational data.",
    endowments: [
      { endowment: "code", verdict: "weak", rationale: "No engineering team." },
      { endowment: "data", verdict: "strong", rationale: "Weighs every ton." },
    ],
    artifacts: [makeArtifact()],
    platforms: [makePlatform()],
    tier3_concepts: [
      {
        name: "The R2 Downstream Transparency Index",
        archetype: "index_report",
        criteria_axis: "downstream disclosure completeness",
        who_would_link: "trade press and certified recyclers",
      },
    ],
    what_not_to_do: ["Do not run a scholarship you will not actually award."],
  };

  it("returns endowments in canonical doctrine order, not the order given", () => {
    const result = coerceEndowmentPortfolio(valid);
    expect(result.endowments.map((entry) => entry.endowment)).toEqual(["data", "code"]);
  });

  it("normalizes platform domains and slugs on the way in", () => {
    const result = coerceEndowmentPortfolio({
      ...valid,
      platforms: [makePlatform({ domain: "HTTPS://WWW.Zenodo.org/", suggested_slug: "Zenodo!" })],
    });
    expect(result.platforms[0]?.domain).toBe("zenodo.org");
    expect(result.platforms[0]?.suggested_slug).toBe("zenodo");
  });

  it("drops the agent's own duplicate platforms — one run must not race itself", () => {
    const result = coerceEndowmentPortfolio({
      ...valid,
      platforms: [
        makePlatform(),
        makePlatform({ name: "Zenodo (EU)", suggested_slug: "zenodo-eu" }),
      ],
    });
    expect(result.platforms).toHaveLength(1);
  });

  it("drops entries with no identity instead of rendering unclickable rows", () => {
    const result = coerceEndowmentPortfolio({
      ...valid,
      artifacts: [makeArtifact(), makeArtifact({ title: "  " })],
      platforms: [makePlatform(), makePlatform({ domain: "", suggested_slug: "ghost" })],
    });
    expect(result.artifacts).toHaveLength(1);
    expect(result.platforms).toHaveLength(1);
  });

  it("falls back on unknown enum values rather than throwing away the row", () => {
    const result = coerceEndowmentPortfolio({
      ...valid,
      platforms: [makePlatform({ tier: "gigantic" as never, api_access_guess: "maybe" as never })],
    });
    expect(result.platforms[0]?.tier).toBe("vertical");
    expect(result.platforms[0]?.api_access_guess).toBe("none");
  });

  it("clamps a nonsense effort estimate to zero", () => {
    const result = coerceEndowmentPortfolio({
      ...valid,
      artifacts: [makeArtifact({ effort_hours: "lots" as never })],
    });
    expect(result.artifacts[0]?.effort_hours).toBe(0);
  });

  it("throws when there is nothing actionable at all", () => {
    expect(() => coerceEndowmentPortfolio(null)).toThrow(/no structured portfolio/i);
    expect(() =>
      coerceEndowmentPortfolio({ ...valid, artifacts: [], platforms: [] }),
    ).toThrow(/nothing to act on/i);
  });
});

describe("matchPlatformsToRegistry", () => {
  it("matches on domain even when the slugs disagree", () => {
    const [match] = matchPlatformsToRegistry(
      [makePlatform({ suggested_slug: "zenodo-open-data" })],
      [makePublisher()],
    );
    expect(match?.matchedBy).toBe("domain");
    expect(match?.existing?.slug).toBe("zenodo");
  });

  it("matches on domain across www / scheme differences in the stored row", () => {
    const [match] = matchPlatformsToRegistry(
      [makePlatform()],
      [makePublisher({ domain: "https://www.zenodo.org/" })],
    );
    expect(match?.matchedBy).toBe("domain");
  });

  it("falls back to the slug when the registry row has no domain", () => {
    const [match] = matchPlatformsToRegistry(
      [makePlatform()],
      [makePublisher({ domain: null })],
    );
    expect(match?.matchedBy).toBe("slug");
  });

  it("reports no match for a genuinely new property", () => {
    const [match] = matchPlatformsToRegistry(
      [makePlatform({ name: "Figshare", domain: "figshare.com", suggested_slug: "figshare" })],
      [makePublisher()],
    );
    expect(match?.existing).toBeNull();
    expect(match?.matchedBy).toBeNull();
  });

  it("prefers domain over slug when both would match different rows", () => {
    const byDomain = makePublisher({ id: "pub-domain", slug: "zenodo-eu" });
    const bySlug = makePublisher({ id: "pub-slug", slug: "zenodo", domain: "example.org" });
    const [match] = matchPlatformsToRegistry([makePlatform()], [bySlug, byDomain]);
    expect(match?.existing?.id).toBe("pub-domain");
  });
});

describe("toDiscoveredPublisher", () => {
  it("carries the submission recipe and the signup URL into api_notes", () => {
    const row = toDiscoveredPublisher(makePlatform(), "brand-1");
    expect(row.apiNotes).toContain("mints a DOI");
    expect(row.apiNotes).toContain("Signup: https://zenodo.org/signup");
    expect(row.manageUrl).toBe("https://zenodo.org/signup");
  });

  it("ranks agent-discovered rows below the hand-curated registry (WS7: 400+)", () => {
    expect(toDiscoveredPublisher(makePlatform({ tier: "critical" }), "b").sortRank).toBeGreaterThanOrEqual(400);
    expect(toDiscoveredPublisher(makePlatform({ tier: "long_tail" }), "b").sortRank).toBe(470);
  });

  it("flags aggregators from the tier, and stamps discovery provenance", () => {
    const row = toDiscoveredPublisher(makePlatform({ tier: "aggregator" }), "brand-1");
    expect(row.tier).toBe("aggregator");
    expect(row.metadata).toEqual({
      discovered_by: "marketing.endowment_portfolio",
      endowment: "data",
      brand_id: "brand-1",
    });
  });
});

describe("the artifact queue", () => {
  it("gives the same artifact the same dedupe key across runs", () => {
    const key = artifactTaskDedupeKey("brand-1", makeArtifact());
    expect(artifactTaskDedupeKey("brand-1", makeArtifact({ title: " Annual Commodity-Yield-Per-Ton Dataset " }))).toBe(key);
  });

  it("separates the same artifact under different brands", () => {
    expect(artifactTaskDedupeKey("brand-1", makeArtifact())).not.toBe(
      artifactTaskDedupeKey("brand-2", makeArtifact()),
    );
  });

  it("prioritizes by production cost — cheap propagation first", () => {
    expect(artifactPriority(makeArtifact({ effort_hours: 2 }))).toBe("high");
    expect(artifactPriority(makeArtifact({ effort_hours: 12 }))).toBe("medium");
    expect(artifactPriority(makeArtifact({ effort_hours: 40 }))).toBe("low");
  });

  it("builds a task that explains itself and links back to the brand", () => {
    const task = toArtifactTask(makeArtifact(), {
      brandId: "brand-1",
      brandLabel: "All Green",
      surfaceUrl: "/marketing/local?brand=brand-1",
    });
    expect(task.sourceId).toBe("brand-1");
    expect(task.sourceType).toBe("marketing_brand");
    expect(task.sourceUrl).toBe("/marketing/local?brand=brand-1");
    expect(task.description).toContain("Endowment: Data");
    expect(task.description).toContain("DOI citations");
    expect(task.description).toContain("6 hours");
    expect(task.description).toContain("Target platforms: Zenodo");
    expect(task.metadata.mandate_key).toBe("marketing.endowment_portfolio");
  });

  it("writes a singular hour without a stray plural", () => {
    const task = toArtifactTask(makeArtifact({ effort_hours: 1 }), {
      brandId: "b",
      brandLabel: "B",
      surfaceUrl: "/x",
    });
    expect(task.description).toContain("1 hour");
    expect(task.description).not.toContain("1 hours");
  });
});
