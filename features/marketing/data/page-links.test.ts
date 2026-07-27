import {
  anchorComplianceByPartner,
  buildAnchorTextReport,
  normalizeAnchorText,
  sanitizeAcceptedAnchorTexts,
  type AnchorLinkOccurrence,
} from "@/features/marketing/data/page-links";

describe("marketing page anchor-text reporting", () => {
  it("normalizes exact matching without losing the authored display spelling", () => {
    expect(normalizeAnchorText("  Local   SEO Services ")).toBe(
      "local seo services",
    );
    expect(
      sanitizeAcceptedAnchorTexts([
        " Local SEO Services ",
        "local   seo services",
        "",
        "SEO agency",
      ]),
    ).toEqual(["Local SEO Services", "SEO agency"]);
  });

  it("groups links by normalized anchor and reports page-level issues", () => {
    const occurrences: AnchorLinkOccurrence[] = [
      {
        edgeId: "edge-1",
        anchorText: "Local SEO Services",
        partnerUrl: "https://example.com/a",
        partnerPageId: "page-a",
        acceptedAnchors: ["local seo services", "SEO agency"],
      },
      {
        edgeId: "edge-2",
        anchorText: "local   seo services",
        partnerUrl: "https://example.com/b",
        partnerPageId: "page-b",
        acceptedAnchors: ["Local SEO Services", "SEO agency"],
      },
      {
        edgeId: "edge-3",
        anchorText: "click here",
        partnerUrl: "https://example.com/a",
        partnerPageId: "page-a",
        acceptedAnchors: ["Local SEO Services", "SEO agency"],
      },
      {
        edgeId: "edge-4",
        anchorText: null,
        partnerUrl: "https://example.com/c",
        partnerPageId: "page-c",
        acceptedAnchors: [],
      },
    ];

    const report = buildAnchorTextReport(occurrences);
    expect(report.groups).toHaveLength(3);
    expect(
      report.groups.find((group) => group.key === "local seo services"),
    ).toMatchObject({
      linkCount: 2,
      pageCount: 2,
      acceptableLinks: 2,
      unacceptableLinks: 0,
    });
    expect(report.summary).toMatchObject({
      totalLinks: 4,
      trackedLinks: 3,
      acceptableLinks: 2,
      unacceptableLinks: 1,
      untrackedLinks: 1,
      acceptablePercent: (2 / 3) * 100,
      unacceptablePercent: (1 / 3) * 100,
    });

    expect(
      anchorComplianceByPartner(report).get("https://example.com/a"),
    ).toMatchObject({
      linkCount: 2,
      acceptableLinks: 1,
      unacceptableLinks: 1,
      acceptedAnchors: ["Local SEO Services", "SEO agency"],
    });
  });
});
