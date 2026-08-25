import { isUuidFilter } from "@/features/marketing/data/analysis-query";

/**
 * Resolve the website whose navigation must stay in Marketing's sidebar.
 *
 * Most website work lives under the canonical brand-first route, but three
 * established workspaces deliberately live at the Marketing level. The
 * sidebar cares about the user's website context, not which URL shape happens
 * to carry it, so every supported shape is declared here once.
 */

export interface MarketingSidebarSiteContext {
  siteId: string;
  brandId: string | null;
}

const CANONICAL_SITE_PATH =
  /^\/marketing\/brands\/([^/]+)\/sites\/([^/]+)(?:\/|$)/;
const LEGACY_SITE_PATH = /^\/marketing\/sites\/([^/]+)(?:\/|$)/;
const CONTENT_PLAN_SITE_PATH = /^\/marketing\/content-plan\/([^/]+)(?:\/|$)/;

const QUERY_SCOPED_SITE_ROUTES = new Set([
  "/marketing/capabilities",
  "/marketing/search-console",
]);

const WEBSITE_WORKSPACE_ROUTES = new Set([
  "/marketing/capabilities",
  "/marketing/content-plan",
  "/marketing/ranks",
  "/marketing/search-console",
  "/marketing/sites",
]);

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveMarketingSidebarSiteContext(
  pathname: string,
  selectedSiteId?: string | null,
): MarketingSidebarSiteContext | null {
  const canonical = CANONICAL_SITE_PATH.exec(pathname);
  if (canonical) {
    return { brandId: canonical[1], siteId: canonical[2] };
  }

  const legacy = LEGACY_SITE_PATH.exec(pathname);
  if (legacy && legacy[1] !== "new") {
    return { brandId: null, siteId: legacy[1] };
  }

  const contentPlan = CONTENT_PLAN_SITE_PATH.exec(pathname);
  if (contentPlan && contentPlan[1] !== "nodes") {
    return { brandId: null, siteId: contentPlan[1] };
  }

  const querySiteId = nonEmpty(selectedSiteId);
  if (querySiteId && QUERY_SCOPED_SITE_ROUTES.has(pathname)) {
    return isUuidFilter(querySiteId)
      ? { brandId: null, siteId: querySiteId }
      : null;
  }

  return null;
}

/** The clear Marketing → Websites cutoff when no single site is selected. */
export function isMarketingWebsiteWorkspace(pathname: string): boolean {
  if (pathname === "/marketing/sites/new") return true;
  return WEBSITE_WORKSPACE_ROUTES.has(pathname);
}
