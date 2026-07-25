import { buildSiteAuditRollup } from "./audit-rollup";
import { buildStoredSeoMetrics } from "@/features/marketing/seo/serp/metrics";
import { buildStoredAuditMetrics } from "@/features/marketing/seo/audit/stored";

const GOOD_URL = "https://example.com/blog/clean-post";

function auditFor(url: string, overrides?: { title?: string | null; robots?: string }) {
  return buildStoredAuditMetrics(
    {
      social: {
        ogTitle: overrides?.title === undefined ? "A share title" : overrides.title,
        ogDescription: "A share description",
        ogImage: "https://example.com/i.png",
        ogSiteName: "Example",
        ogUrl: url,
        ogType: "website",
        twitterCard: "summary_large_image",
        twitterTitle: null,
        twitterDescription: null,
        twitterImage: null,
      },
      headings: [
        { text: "Main", level: 1 },
        { text: "Sub", level: 2 },
      ],
      indexability: {
        httpStatus: 200,
        metaRobots: overrides?.robots ?? "index, follow",
        canonicalUrl: url,
        redirectChain: [],
        finalUrl: url,
      },
      url,
    },
    "client",
  );
}

describe("buildSiteAuditRollup", () => {
  it("aggregates verdicts, passes, issues, and worst pages", () => {
    const rollup = buildSiteAuditRollup([
      {
        id: "p1",
        url: GOOD_URL,
        path: "/blog/clean-post",
        seo_metrics: buildStoredSeoMetrics(
          "A perfectly sized meta title for this page",
          "Learn how the platform works, what it costs, and how teams use it to ship real work every single day.",
          "client",
        ),
        audit_metrics: auditFor(GOOD_URL),
      },
      {
        id: "p2",
        url: "https://example.com/Bad_Path?x=1",
        path: "/Bad_Path",
        seo_metrics: null,
        audit_metrics: auditFor("https://example.com/Bad_Path?x=1", {
          title: null,
          robots: "noindex",
        }),
      },
      // Never crawled — URL quality still evaluates live.
      {
        id: "p3",
        url: "https://example.com/fine",
        path: "/fine",
        seo_metrics: null,
        audit_metrics: null,
      },
    ]);

    expect(rollup.totalPages).toBe(3);
    expect(rollup.auditedPages).toBe(2);
    expect(rollup.uncomputedPages).toBe(1);
    expect(rollup.verdicts).toEqual({ indexable: 1, check: 0, blocked: 1 });
    expect(rollup.passes.serp).toBe(1);
    expect(rollup.passes.social).toBe(1);
    expect(rollup.passes.headings).toBe(2);
    // p1 and p3 have clean URLs; p2 has uppercase + underscore + query.
    expect(rollup.passes.url).toBe(2);

    const noindexIssue = rollup.topIssues.find((issue) =>
      issue.message.includes("noindex"),
    );
    expect(noindexIssue?.severity).toBe("error");
    expect(noindexIssue?.count).toBe(1);
    expect(noindexIssue?.samples[0]).toEqual({ pageId: "p2", path: "/Bad_Path" });
    // Errors sort ahead of warnings regardless of count.
    expect(rollup.topIssues[0].severity).toBe("error");

    expect(rollup.worstPages[0].pageId).toBe("p2");
    expect(rollup.worstPages[0].errorCount).toBeGreaterThan(0);
    // p3 is clean everywhere → not in worst pages.
    expect(rollup.worstPages.some((page) => page.pageId === "p3")).toBe(false);
  });

  it("handles an empty site", () => {
    const rollup = buildSiteAuditRollup([]);
    expect(rollup.totalPages).toBe(0);
    expect(rollup.topIssues).toEqual([]);
    expect(rollup.worstPages).toEqual([]);
  });
});
