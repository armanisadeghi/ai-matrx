import { buildSiteAuditRollup } from "./audit-rollup";
import { buildStoredSeoMetrics } from "@/features/marketing/seo/serp/metrics";
import { buildStoredAuditMetrics } from "@/features/marketing/seo/audit/stored";

const GOOD_URL = "https://example.com/blog/clean-post";

function auditFor(
  url: string,
  overrides?: { title?: string | null; robots?: string },
) {
  return buildStoredAuditMetrics(
    {
      social: {
        ogTitle:
          overrides?.title === undefined ? "A share title" : overrides.title,
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
        contentTypeLast: "html",
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
        contentTypeLast: "html",
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
        contentTypeLast: null,
        seo_metrics: null,
        audit_metrics: null,
      },
    ]);

    expect(rollup.totalPages).toBe(3);
    expect(rollup.nonHtmlResources).toBe(0);
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
    expect(noindexIssue?.samples[0]).toEqual({
      pageId: "p2",
      path: "/Bad_Path",
    });
    // Errors sort ahead of warnings regardless of count.
    expect(rollup.topIssues[0].severity).toBe("error");

    expect(rollup.worstPages[0].pageId).toBe("p2");
    expect(rollup.worstPages[0].errorCount).toBeGreaterThan(0);
    // p3 is clean everywhere → not in worst pages.
    expect(rollup.worstPages.some((page) => page.pageId === "p3")).toBe(false);
  });

  it("aggregates completely — no top-issue or worst-page caps", () => {
    // 20 pages, each with a distinct over-long title (distinct char counts →
    // distinct SERP issue messages), so distinct issues > 14 and finding
    // pages > 10 — the old in-aggregation caps would truncate both.
    const rollup = buildSiteAuditRollup(
      Array.from({ length: 20 }, (_, i) => ({
        id: `p${i}`,
        url: `https://example.com/page-${i}`,
        path: `/page-${i}`,
        contentTypeLast: "html",
        seo_metrics: buildStoredSeoMetrics(
          "t".repeat(80 + i),
          "Learn how the platform works, what it costs, and how teams use it to ship real work every single day.",
          "client",
        ),
        audit_metrics: null,
      })),
    );

    expect(rollup.worstPages).toHaveLength(20);
    expect(rollup.topIssues.length).toBeGreaterThan(14);
    // Ranking is preserved: counts never increase down the list within a
    // severity band (all warnings here).
    const counts = rollup.topIssues.map((issue) => issue.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it("aggregates a site far past the retired 5,000-page fetch cap", () => {
    // The client-side fetch used to page `web.page` behind a hard 5,000-row
    // ceiling and THROW when a site crossed it — allgreenrecycling.com sat 469
    // crawled rows away from a blank audit page. Aggregation now happens in
    // Postgres (web.site_audit_rollup) with no cap, and this reference
    // implementation must have none either: every page counted, every finding
    // kept, nothing sampled.
    const PAGES = 6200;
    const rollup = buildSiteAuditRollup(
      Array.from({ length: PAGES }, (_, i) => {
        // Every 10th page is a WordPress REST endpoint the crawler never
        // stamped — excluded by URL shape alone, exactly as at real scale.
        const isMachine = i % 10 === 0;
        const url = isMachine
          ? `https://example.com/wp-json/wp/v2/posts/${i}`
          : `https://example.com/page-${i}`;
        return {
          id: `p${i}`,
          url,
          path: isMachine ? `/wp-json/wp/v2/posts/${i}` : `/page-${i}`,
          contentTypeLast: null,
          seo_metrics: buildStoredSeoMetrics(
            "t".repeat(80),
            "Learn how the platform works, what it costs, and how teams use it to ship real work every single day.",
            "client",
          ),
          audit_metrics: auditFor(url, { title: null }),
        };
      }),
    );

    const machinePages = PAGES / 10;
    expect(rollup.nonHtmlResources).toBe(machinePages);
    expect(rollup.totalPages).toBe(PAGES - machinePages);
    expect(rollup.auditedPages).toBe(PAGES - machinePages);
    // Every HTML page carries findings, and every one of them is reported.
    expect(rollup.worstPages).toHaveLength(PAGES - machinePages);
    // The shared over-long-title issue is counted on all of them, not capped.
    const titleIssue = rollup.topIssues.find((issue) =>
      issue.message.includes("Title is too long"),
    );
    expect(titleIssue?.count).toBe(PAGES - machinePages);
    expect(titleIssue?.samples).toHaveLength(3);
    // And no /wp-json endpoint leaked into the findings at this scale.
    expect(
      rollup.worstPages.some((page) => page.url.includes("/wp-json")),
    ).toBe(false);
  });

  it("handles an empty site", () => {
    const rollup = buildSiteAuditRollup([]);
    expect(rollup.totalPages).toBe(0);
    expect(rollup.topIssues).toEqual([]);
    expect(rollup.worstPages).toEqual([]);
  });

  it("excludes known non-HTML resources without URL or HTML audit findings", () => {
    const rollup = buildSiteAuditRollup([
      {
        id: "resource",
        url: "https://example.com/wp-json/oembed/1.0/embed?url=post",
        path: "/wp-json/oembed/1.0/embed",
        contentTypeLast: "json",
        seo_metrics: buildStoredSeoMetrics("", "", "client"),
        audit_metrics: auditFor(
          "https://example.com/wp-json/oembed/1.0/embed?url=post",
          { title: null },
        ),
      },
      {
        id: "html",
        url: GOOD_URL,
        path: "/blog/clean-post",
        contentTypeLast: "html",
        seo_metrics: buildStoredSeoMetrics(
          "A perfectly sized meta title for this page",
          "Learn how the platform works, what it costs, and how teams use it to ship real work every single day.",
          "client",
        ),
        audit_metrics: auditFor(GOOD_URL),
      },
    ]);

    expect(rollup.totalPages).toBe(1);
    expect(rollup.auditedPages).toBe(1);
    expect(rollup.uncomputedPages).toBe(0);
    expect(rollup.nonHtmlResources).toBe(1);
    expect(rollup.worstPages.some((page) => page.pageId === "resource")).toBe(
      false,
    );
  });

  it("excludes machine endpoints the crawler never stamped a content type on", () => {
    // The real datadestruction.com shape: the pre-2026-07-27 crawler followed
    // WordPress' json+oembed <head> link, fetched the JSON, never recorded
    // content_type_last, and scored the response with the HTML audit. 717 such
    // rows became the site's "pages needing attention" list, each faulted for
    // missing og:title and <h1>. content_type_last is NULL, so URL shape is the
    // only signal that can catch them.
    const OEMBED =
      "https://datadestruction.com/wp-json/oembed/1.0/embed" +
      "?url=https%3A%2F%2Fdatadestruction.com%2Fhard-drive-shredding%2F";

    const rollup = buildSiteAuditRollup([
      {
        id: "oembed",
        url: OEMBED,
        path: "/wp-json/oembed/1.0/embed",
        contentTypeLast: null,
        seo_metrics: buildStoredSeoMetrics("", "", "client"),
        audit_metrics: auditFor(OEMBED, { title: null }),
      },
      {
        id: "rest",
        url: "https://datadestruction.com/wp-json/wp/v2/compliance/21086",
        path: "/wp-json/wp/v2/compliance/21086",
        contentTypeLast: null,
        seo_metrics: buildStoredSeoMetrics("", "", "client"),
        audit_metrics: auditFor(
          "https://datadestruction.com/wp-json/wp/v2/compliance/21086",
          { title: null },
        ),
      },
      {
        // A never-fetched, page-shaped URL still counts as a page.
        id: "uncrawled",
        url: "https://datadestruction.com/compliance/state-laws/arizona",
        path: "/compliance/state-laws/arizona",
        contentTypeLast: null,
        seo_metrics: null,
        audit_metrics: null,
      },
      {
        id: "html",
        url: GOOD_URL,
        path: "/blog/clean-post",
        contentTypeLast: "html",
        seo_metrics: buildStoredSeoMetrics(
          "A perfectly sized meta title for this page",
          "Learn how the platform works, what it costs, and how teams use it to ship real work every single day.",
          "client",
        ),
        audit_metrics: auditFor(GOOD_URL),
      },
    ]);

    expect(rollup.nonHtmlResources).toBe(2);
    expect(rollup.totalPages).toBe(2);
    expect(rollup.uncomputedPages).toBe(1);
    expect(
      rollup.worstPages.filter((page) => page.url.includes("/wp-json")),
    ).toEqual([]);
    // And their invented findings never reach the site-wide issue list.
    expect(
      rollup.topIssues.some((issue) =>
        issue.samples.some((sample) => sample.path.startsWith("/wp-json")),
      ),
    ).toBe(false);
  });

  it("counts an alias URL once, not twice", () => {
    // An alias is the SAME document under a second URL — the live cases are
    // http:// twins of https:// pages. 47 exist today, 32 on one site. Counting
    // both inflates the page count and doubles every finding on that document.
    const rollup = buildSiteAuditRollup([
      {
        id: "canonical",
        url: GOOD_URL,
        path: "/blog/clean-post",
        contentTypeLast: "html",
        canonicalPageId: "canonical",
        seo_metrics: null,
        audit_metrics: auditFor(GOOD_URL, { title: null }),
      },
      {
        id: "alias",
        url: "http://example.com/blog/clean-post",
        path: "/blog/clean-post",
        contentTypeLast: "html",
        canonicalPageId: "canonical",
        seo_metrics: null,
        audit_metrics: auditFor(GOOD_URL, { title: null }),
      },
    ]);

    expect(rollup.totalPages).toBe(1);
    expect(rollup.worstPages).toHaveLength(1);
    expect(rollup.worstPages[0].pageId).toBe("canonical");
    // And the finding is reported once, on one page — not twice.
    const social = rollup.topIssues.find((i) => i.section === "social");
    expect(social?.count).toBe(1);
  });
});
