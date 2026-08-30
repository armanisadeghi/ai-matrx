import { MARKETING_RESERVED_SEGMENTS } from "@/features/marketing/lib/keys";

/**
 * Resolve which of Marketing's FOUR sidebar menus the current URL belongs to.
 *
 * The agency-model tree makes this structural (2026-08-28): the first segment
 * after `/marketing` is either a reserved agency-plane word or a brand key,
 * and inside a brand the `websites/[siteId]` and `seo/[siteId]` branches carry
 * their own menus. One declaration; the sidebar never guesses from menus'
 * point of view which URL shape carries the context.
 *
 *   agency  — /marketing, /marketing/brands, /marketing/operations/…
 *   brand   — /marketing/[brandSeg]/… (any client-workspace section)
 *   website — /marketing/[brandSeg]/websites/[siteSeg]/…
 *   seo     — /marketing/[brandSeg]/seo/[siteSeg]/…
 */

export type MarketingSidebarContext =
  | { kind: "agency" }
  | { kind: "brand"; brandSeg: string }
  | { kind: "website"; brandSeg: string; siteSeg: string }
  | { kind: "seo"; brandSeg: string; siteSeg: string };

export function resolveMarketingSidebarContext(
  pathname: string,
): MarketingSidebarContext {
  const match = /^\/marketing(?:\/(.*))?$/.exec(pathname);
  if (!match) return { kind: "agency" };
  const segments = (match[1] ?? "").split("/").filter(Boolean);
  const first = segments[0];
  if (!first || MARKETING_RESERVED_SEGMENTS.has(first)) {
    return { kind: "agency" };
  }
  const brandSeg = first;
  if (segments[1] === "websites" && segments[2]) {
    return { kind: "website", brandSeg, siteSeg: segments[2] };
  }
  if (segments[1] === "seo" && segments[2]) {
    return { kind: "seo", brandSeg, siteSeg: segments[2] };
  }
  return { kind: "brand", brandSeg };
}

export interface MarketingSidebarSiteContext {
  brandId: string | null;
  siteId: string;
}

function validSiteSegment(value: string | null | undefined): value is string {
  return Boolean(value && /^[A-Za-z0-9_-]+$/.test(value));
}

/** Compatibility resolver for legacy brand-first and flat site shims. */
export function resolveMarketingSidebarSiteContext(
  pathname: string,
  selectedSiteId?: string | null,
): MarketingSidebarSiteContext | null {
  const canonical = /^\/marketing\/brands\/([^/]+)\/sites\/([^/]+)/.exec(
    pathname,
  );
  if (canonical && validSiteSegment(canonical[1]) && validSiteSegment(canonical[2])) {
    return { brandId: canonical[1], siteId: canonical[2] };
  }
  const flat = /^\/marketing\/sites\/([^/]+)/.exec(pathname);
  if (flat && flat[1] !== "new" && validSiteSegment(flat[1])) {
    return { brandId: null, siteId: flat[1] };
  }
  const plan = /^\/marketing\/content-plan\/([^/]+)$/.exec(pathname);
  if (plan && validSiteSegment(plan[1])) {
    return { brandId: null, siteId: plan[1] };
  }
  if (
    (pathname === "/marketing/search-console" ||
      pathname === "/marketing/capabilities") &&
    validSiteSegment(selectedSiteId)
  ) {
    return { brandId: null, siteId: selectedSiteId };
  }
  return null;
}

export function isMarketingWebsiteWorkspace(pathname: string): boolean {
  return [
    "/marketing/sites",
    "/marketing/content-plan",
    "/marketing/search-console",
    "/marketing/capabilities",
    "/marketing/ranks",
  ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
