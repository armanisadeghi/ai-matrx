/**
 * Unit contract for the pure anchor classifier + profile analyzer: class
 * routing (branded via domain core / brand name, naked-URL forms, the generic
 * set, empty, topical fallback) and the threshold-driven warning math.
 */
import {
  MIN_LINKS_FOR_WARNINGS,
  SINGLE_ANCHOR_SHARE_WARN,
  TOPICAL_SHARE_CRITICAL,
  TOPICAL_SHARE_WARN,
  analyzeAnchorProfile,
  classifyAnchor,
  type AnchorClassifierContext,
  type AnchorProfileRow,
} from "./anchors";

const CTX: AnchorClassifierContext = {
  domain: "https://www.example.com",
  brandNames: ["Example Inc"],
};

describe("classifyAnchor", () => {
  it("classifies anchors containing the domain core as branded", () => {
    expect(classifyAnchor("Example", CTX)).toBe("branded");
    expect(classifyAnchor("the example blog", CTX)).toBe("branded");
    expect(classifyAnchor("Example's guide", CTX)).toBe("branded");
  });

  it("classifies anchors containing a brand name as branded (other domain)", () => {
    const ctx: AnchorClassifierContext = {
      domain: "othersite.com",
      brandNames: ["Acme Corp"],
    };
    expect(classifyAnchor("Acme Corp reviews", ctx)).toBe("branded");
    expect(classifyAnchor("visit AcmeCorp today", ctx)).toBe("branded");
  });

  it("classifies naked URL forms, including a bare domain with a path", () => {
    expect(classifyAnchor("https://example.com", CTX)).toBe("naked_url");
    expect(classifyAnchor("http://example.com/page", CTX)).toBe("naked_url");
    expect(classifyAnchor("www.example.com", CTX)).toBe("naked_url");
    expect(classifyAnchor("example.com/page", CTX)).toBe("naked_url");
    expect(classifyAnchor("example.com", CTX)).toBe("naked_url");
  });

  it("classifies the generic anchor set, case-insensitively", () => {
    expect(classifyAnchor("click here", CTX)).toBe("generic");
    expect(classifyAnchor("Read More", CTX)).toBe("generic");
    expect(classifyAnchor("WEBSITE", CTX)).toBe("generic");
    expect(classifyAnchor("  here  ", CTX)).toBe("generic");
  });

  it("classifies missing or blank anchors as empty", () => {
    expect(classifyAnchor(null, CTX)).toBe("empty");
    expect(classifyAnchor(undefined, CTX)).toBe("empty");
    expect(classifyAnchor("", CTX)).toBe("empty");
    expect(classifyAnchor("   ", CTX)).toBe("empty");
  });

  it("falls back to topical for keyword-bearing anchors", () => {
    expect(classifyAnchor("best crm software", CTX)).toBe("topical");
    expect(classifyAnchor("electronics recycling near me", CTX)).toBe(
      "topical",
    );
  });
});

/** N distinct topical anchors, each carrying `links` backlinks. */
function topicalRows(count: number, links: number): AnchorProfileRow[] {
  return Array.from({ length: count }, (_, i) => ({
    anchor: `keyword phrase ${i + 1}`,
    backlinks: links,
  }));
}

describe("analyzeAnchorProfile", () => {
  it("shares sum to 1 and per-class counts add up", () => {
    const rows: AnchorProfileRow[] = [
      { anchor: "Example", backlinks: 40 },
      { anchor: "example.com", backlinks: 20 },
      { anchor: "click here", backlinks: 20 },
      { anchor: null, backlinks: 10 },
      { anchor: "best widgets", backlinks: 10 },
    ];
    const profile = analyzeAnchorProfile(rows, CTX);
    expect(profile.totalBacklinks).toBe(100);
    expect(profile.totalAnchors).toBe(5);
    const shareSum = profile.entries.reduce((sum, e) => sum + e.share, 0);
    expect(shareSum).toBeCloseTo(1, 10);
    const linkSum = profile.entries.reduce((sum, e) => sum + e.backlinks, 0);
    expect(linkSum).toBe(100);
  });

  it("warns at the topical warning threshold", () => {
    // 30% topical spread across 5 anchors (6% each — below the single-anchor
    // concentration line, so the ONLY warning is the topical-share one).
    const rows: AnchorProfileRow[] = [
      { anchor: "Example", backlinks: 70 },
      ...topicalRows(5, 6),
    ];
    const profile = analyzeAnchorProfile(rows, CTX);
    expect(
      profile.entries.find((e) => e.key === "topical")?.share,
    ).toBeCloseTo(TOPICAL_SHARE_WARN, 10);
    expect(profile.warnings).toHaveLength(1);
    expect(profile.warnings[0].severity).toBe("warning");
  });

  it("escalates to critical at the topical critical threshold", () => {
    // 50% topical across 10 anchors (5% each — no concentration warnings).
    const rows: AnchorProfileRow[] = [
      { anchor: "Example", backlinks: 50 },
      ...topicalRows(10, 5),
    ];
    const profile = analyzeAnchorProfile(rows, CTX);
    expect(
      profile.entries.find((e) => e.key === "topical")?.share,
    ).toBeCloseTo(TOPICAL_SHARE_CRITICAL, 10);
    expect(profile.warnings).toHaveLength(1);
    expect(profile.warnings[0].severity).toBe("critical");
  });

  it("stays silent just below the topical warning threshold", () => {
    // 29% topical across 29 anchors (1% each).
    const rows: AnchorProfileRow[] = [
      { anchor: "Example", backlinks: 71 },
      ...topicalRows(29, 1),
    ];
    const profile = analyzeAnchorProfile(rows, CTX);
    expect(profile.warnings).toHaveLength(0);
  });

  it("flags a single non-branded anchor carrying an outsized share", () => {
    // 15% on one topical anchor — over the 10% concentration line but under
    // the 30% topical-share line, so the concentration warning stands alone.
    const rows: AnchorProfileRow[] = [
      { anchor: "Example", backlinks: 85 },
      { anchor: "buy widgets online", backlinks: 15 },
    ];
    const profile = analyzeAnchorProfile(rows, CTX);
    expect(profile.concentrated).toEqual([
      { anchor: "buy widgets online", backlinks: 15, share: 0.15 },
    ]);
    expect(profile.warnings).toHaveLength(1);
    expect(profile.warnings[0].severity).toBe("warning");
    expect(profile.warnings[0].message).toContain("buy widgets online");
  });

  it("never lists branded or naked-URL anchors as concentrated", () => {
    const rows: AnchorProfileRow[] = [
      { anchor: "Example", backlinks: 50 },
      { anchor: "example.com", backlinks: 50 },
    ];
    const profile = analyzeAnchorProfile(rows, CTX);
    expect(profile.concentrated).toHaveLength(0);
    expect(profile.warnings).toHaveLength(0);
  });

  it("emits no warnings below MIN_LINKS_FOR_WARNINGS total links", () => {
    // 100% topical on one anchor — screams at any real volume, but the total
    // sits below the noise floor.
    const rows: AnchorProfileRow[] = [
      { anchor: "buy widgets online", backlinks: MIN_LINKS_FOR_WARNINGS - 1 },
    ];
    const profile = analyzeAnchorProfile(rows, CTX);
    expect(profile.totalBacklinks).toBeLessThan(MIN_LINKS_FOR_WARNINGS);
    expect(profile.warnings).toHaveLength(0);
    // Sanity: the same profile at the floor DOES warn.
    const atFloor = analyzeAnchorProfile(
      [{ anchor: "buy widgets online", backlinks: MIN_LINKS_FOR_WARNINGS }],
      CTX,
    );
    expect(atFloor.warnings.length).toBeGreaterThan(0);
  });

  it("handles empty input without NaN shares", () => {
    const profile = analyzeAnchorProfile([], CTX);
    expect(profile.totalBacklinks).toBe(0);
    expect(profile.entries.every((e) => e.share === 0)).toBe(true);
    expect(profile.warnings).toHaveLength(0);
    expect(profile.concentrated).toHaveLength(0);
  });

  it("uses the exported single-anchor threshold as the concentration line", () => {
    const total = 100;
    const justUnder = Math.round(total * SINGLE_ANCHOR_SHARE_WARN) - 1;
    const rows: AnchorProfileRow[] = [
      { anchor: "Example", backlinks: total - justUnder },
      { anchor: "buy widgets online", backlinks: justUnder },
    ];
    expect(analyzeAnchorProfile(rows, CTX).concentrated).toHaveLength(0);
  });
});
