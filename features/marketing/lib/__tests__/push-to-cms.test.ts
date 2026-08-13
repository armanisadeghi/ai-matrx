/**
 * `resolvePushTarget` — the measure↔CMS join, locked.
 *
 * These cases are the FE half of the live proof run against both databases on
 * 2026-08-13: a crawled `/About/` and a CMS `/about` are the same page, and a
 * raw string comparison either loses it or — worse — lands on a different row
 * that happens to spell the route the way the CMS does. `web_page_id` is what
 * makes that impossible (growth-loop gap `G-CMS-IDENTITY`).
 */
import type { ClientPageSummary } from "@/features/cms/types";
import type { MarketingPage } from "@/features/marketing/types";
import { resolvePushTarget } from "@/features/marketing/lib/push-to-cms";

const WEB_PAGE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_WEB_PAGE_ID = "22222222-2222-4222-8222-222222222222";

const marketingPage = (path: string, id = WEB_PAGE_ID): MarketingPage =>
  ({ id, path }) as MarketingPage;

const cmsPage = (
  overrides: Partial<ClientPageSummary> & Pick<ClientPageSummary, "id" | "route">,
): ClientPageSummary =>
  ({
    slug: overrides.route.split("/").filter(Boolean).at(-1) ?? "",
    title: overrides.route,
    category: null,
    page_type: "standard",
    is_published: false,
    has_draft: false,
    is_home_page: false,
    show_in_nav: true,
    sort_order: 0,
    excerpt: null,
    featured_image: null,
    author: null,
    tags: null,
    meta_title: null,
    meta_description: null,
    publish_date: null,
    last_published_at: null,
    updated_at: "2026-08-13T00:00:00Z",
    created_at: "2026-08-13T00:00:00Z",
    plan_node_id: null,
    web_page_id: null,
    ...overrides,
  }) as ClientPageSummary;

describe("resolvePushTarget — the durable link decides identity", () => {
  it("resolves by web_page_id even when the routes no longer agree", () => {
    // The CMS page moved from /about to /about-us; the measured page did not.
    const target = resolvePushTarget(marketingPage("/about"), [
      cmsPage({ id: "cms-1", route: "/about-us", web_page_id: WEB_PAGE_ID }),
      cmsPage({ id: "cms-2", route: "/about" }),
    ]);
    expect(target).toMatchObject({ kind: "existing", matchedBy: "link" });
    expect(target.kind === "existing" && target.page.id).toBe("cms-1");
  });

  it("never reuses a page already linked to a DIFFERENT measured page", () => {
    // The exact silent-wrong-page failure: same route spelling, other owner.
    const target = resolvePushTarget(marketingPage("/about"), [
      cmsPage({ id: "cms-1", route: "/about", web_page_id: OTHER_WEB_PAGE_ID }),
    ]);
    expect(target.kind).toBe("create");
  });

  it("falls back to the exact route key for the FIRST link", () => {
    const target = resolvePushTarget(marketingPage("/about"), [
      cmsPage({ id: "cms-1", route: "/about" }),
    ]);
    expect(target).toMatchObject({ kind: "existing", matchedBy: "route" });
  });

  it("ignores route FORM differences the old comparer tripped on", () => {
    for (const [crawled, served] of [
      ["/about/", "/about"],
      ["/about", "/about/"],
      ["https://example.com/about?utm_source=nav", "/about"],
      ["/services//service-1", "/services/service-1"],
    ]) {
      const target = resolvePushTarget(marketingPage(crawled), [
        cmsPage({ id: "cms-1", route: served }),
      ]);
      expect(target).toMatchObject({ kind: "existing", matchedBy: "route" });
    }
  });

  it("reconciles a case-only difference, but only when it is unambiguous", () => {
    const one = resolvePushTarget(marketingPage("/About"), [
      cmsPage({ id: "cms-1", route: "/about" }),
    ]);
    expect(one).toMatchObject({ kind: "existing", matchedBy: "alias" });

    const many = resolvePushTarget(marketingPage("/About"), [
      cmsPage({ id: "cms-1", route: "/about" }),
      cmsPage({ id: "cms-2", route: "/ABOUT" }),
    ]);
    expect(many.kind).toBe("blocked");
  });

  it("refuses the homepage when the CMS home belongs to another measured page", () => {
    const target = resolvePushTarget(marketingPage("/"), [
      cmsPage({
        id: "cms-home",
        route: "/",
        is_home_page: true,
        web_page_id: OTHER_WEB_PAGE_ID,
      }),
    ]);
    expect(target.kind).toBe("blocked");
  });

  it("still creates below an existing parent when nothing matches", () => {
    const target = resolvePushTarget(marketingPage("/services/service-9"), [
      cmsPage({ id: "cms-parent", route: "/services" }),
    ]);
    expect(target).toMatchObject({
      kind: "create",
      route: "/services/service-9",
      slug: "service-9",
      parentId: "cms-parent",
    });
  });
});
