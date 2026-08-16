import type {
  ClientPage,
  ClientPageSummary,
  ClientSite,
} from "@/features/cms/types";
import type { CmsPageMapEntry } from "@/features/marketing/content-plan/setup/bridge";
import { activeSiteDomain, clientPageUrl, sitePreviewToken } from "./pageUrls";

export type CmsPageListRecord = ClientPageSummary | ClientPage;

export function cmsPageHasContent(page: CmsPageListRecord): boolean {
  if ("html_content" in page) {
    return Boolean(
      page.html_content?.trim() || page.html_content_draft?.trim(),
    );
  }
  const stats = page.content_stats;
  return Boolean(stats && (stats.html_len > 0 || stats.draft_html_len > 0));
}

export function toCmsPageMapEntry(
  page: CmsPageListRecord,
  site: ClientSite,
): CmsPageMapEntry {
  const liveUrl = page.is_published
    ? clientPageUrl({
        siteSlug: site.slug,
        slug: page.slug,
        route: page.route,
        category: page.category,
        domain: activeSiteDomain(site),
      })
    : null;
  return {
    pageId: page.id,
    planNodeId: page.plan_node_id,
    route: page.route,
    title: page.title,
    isPublished: page.is_published,
    hasDraft: page.has_draft,
    isHomePage: page.is_home_page,
    liveUrl,
    previewUrl: clientPageUrl({
      siteSlug: site.slug,
      slug: page.slug,
      route: page.route,
      category: page.category,
      preview: true,
      previewToken: sitePreviewToken(site),
    }),
    // This CMS read does not carry the plan-side exclusion marker. The plan
    // overlay remains authoritative when that distinction matters.
    planExcludedAt: null,
    // The measurement join IS on the CMS row, so a CMS-side caller gets the
    // AFTER door for free — same column the plan overlay reads.
    webPageId: page.web_page_id,
  };
}
