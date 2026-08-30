/**
 * Pure old→new URL translation for the pre-2026-08-28 marketing addresses.
 *
 * Two legacy shapes still land here from bookmarks, stored rows, agent-held
 * URLs and every link built before the agency-model tree:
 *
 *   /marketing/brands/[brandId]/…            (brand-first tree)
 *   /marketing/sites/[siteId]/…              (flat site door)
 *
 * Their shims resolve the brand (and site) server-side and then call the two
 * functions below, which are the ONE place the section mapping lives — the
 * catch-all under `brands/[brandId]` and the two under `sites/[siteId]` must
 * never drift from each other.
 *
 * Section homes come from `MARKETING_SITE_SECTION_HOMES` in `routes.ts` (the
 * spine's declaration of which branch each old section moved to); this module
 * only adds what a URL translation needs on top of it — the settings-tab
 * family, the value→identity moves, and the brand-level sections.
 */

import {
  MARKETING_SITE_SECTION_HOMES,
  marketingSiteSettingsHref,
  type MarketingSiteSettingsView,
} from "@/features/marketing/lib/routes";

/**
 * Business-knowledge screens that left the keyword-value ladder for the brand
 * home (identity owns business truth; valuation consumes it). They carry the
 * site as `?site=` selection, since the destination is brand-scoped.
 */
const VALUE_TO_IDENTITY: Record<string, string> = {
  discovery: "knowledge",
  offerings: "offerings",
  topics: "offerings",
  guidelines: "guidelines",
};

/** Old top-level site sections that were really settings tabs. */
const SETTINGS_SECTIONS: Record<string, MarketingSiteSettingsView> = {
  integrations: "integrations",
  intake: "intake",
};

/** `?view=` on the old settings screen → the route that view became. */
const SETTINGS_VIEWS: Record<string, MarketingSiteSettingsView> = {
  site: "site",
  integrations: "integrations",
  intake: "intake",
  users: "access-users",
  organizations: "access-organizations",
  public: "access-public",
  "access-users": "access-users",
  "access-organizations": "access-organizations",
  "access-public": "access-public",
};

/** Audience `?view=` on the old site access screen → its settings view. */
const ACCESS_VIEWS: Record<string, MarketingSiteSettingsView> = {
  users: "access-users",
  organizations: "access-organizations",
  public: "access-public",
};

/** Keyword `?view=` values that became routes under `seo/[siteId]/keywords`. */
const KEYWORD_VIEW_PATHS: Record<string, string> = {
  start: "",
  performance: "/performance",
  workbench: "/workbench",
  // Retired 2026-08-25; its bookmarks belong on the Workbench.
  classification: "/workbench",
};

/** `?view=` on the old brand asset desk → its route under identity/media. */
const BRAND_ASSET_VIEWS = new Set(["research", "sources", "generate"]);

function readView(query: URLSearchParams): string | null {
  // `?tab=` is the legacy alias every marketing surface has always honoured.
  return query.get("view") ?? query.get("tab");
}

/** Drop the view keys a mapped route now expresses as a path segment. */
function withoutView(query: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(query);
  next.delete("view");
  next.delete("tab");
  return next;
}

function withQuery(path: string, query: URLSearchParams): string {
  const search = query.toString();
  if (!search) return path;
  return path.includes("?") ? `${path}&${search}` : `${path}?${search}`;
}

/**
 * One old `/marketing/brands/[brandId]/sites/[siteId]/<rest>` section → its new
 * address. `brandSeg`/`siteSeg` are already-resolved path segments (key
 * preferred, UUID otherwise).
 */
export function mapLegacySiteRest(
  brandSeg: string,
  siteSeg: string,
  rest: readonly string[],
  query: URLSearchParams,
): string {
  const websiteBase = `/marketing/${brandSeg}/websites/${siteSeg}`;
  const seoBase = `/marketing/${brandSeg}/seo/${siteSeg}`;
  const section = rest[0] ?? "";
  const sub = rest.slice(1);
  const view = readView(query);

  // Business knowledge moved to the brand; the site rides along as selection.
  if (section === "value" && sub[0] && VALUE_TO_IDENTITY[sub[0]]) {
    const params = withoutView(query);
    params.set("site", siteSeg);
    return withQuery(
      `/marketing/${brandSeg}/identity/${VALUE_TO_IDENTITY[sub[0]]}`,
      params,
    );
  }

  // Settings tabs became routes.
  if (section === "settings" && sub.length === 0) {
    const mapped = (view && SETTINGS_VIEWS[view]) || "site";
    return withQuery(
      marketingSiteSettingsHref(websiteBase, mapped),
      withoutView(query),
    );
  }
  if (section === "access" && sub.length === 0) {
    const mapped = (view && ACCESS_VIEWS[view]) || "access-users";
    return withQuery(
      marketingSiteSettingsHref(websiteBase, mapped),
      withoutView(query),
    );
  }
  if (SETTINGS_SECTIONS[section] && sub.length === 0) {
    return withQuery(
      marketingSiteSettingsHref(websiteBase, SETTINGS_SECTIONS[section]),
      withoutView(query),
    );
  }

  // Keyword views became routes; the bare section is "Start here".
  if (section === "keywords" && sub.length === 0 && view) {
    const mapped = KEYWORD_VIEW_PATHS[view];
    if (mapped !== undefined) {
      return withQuery(`${seoBase}/keywords${mapped}`, withoutView(query));
    }
  }

  // Sections that left the site entirely.
  if (section === "discovery") {
    return withQuery(`/marketing/${brandSeg}/inbox`, query);
  }
  if (section === "reputation") {
    return withQuery(
      `/marketing/${brandSeg}/intelligence/reputation/${siteSeg}`,
      query,
    );
  }
  if (section === "capabilities" || section === "search-console") {
    return withQuery(
      `${seoBase}/${section}${sub.length ? `/${sub.join("/")}` : ""}`,
      query,
    );
  }

  const home = MARKETING_SITE_SECTION_HOMES[section];
  if (!home) {
    // Unknown section: keep it under the inventory branch so a stale address
    // lands on a real 404 for that branch rather than on nothing at all.
    const path = rest.length ? `/${rest.join("/")}` : "";
    return withQuery(`${websiteBase}${path}`, query);
  }
  const base = home.branch === "seo" ? seoBase : websiteBase;
  const mapped = [home.slug, ...sub].filter(Boolean).join("/");
  return withQuery(mapped ? `${base}/${mapped}` : base, query);
}

/**
 * One old `/marketing/brands/[brandId]/<rest>` BRAND section → its new address.
 * Returns null for the `sites/<siteId>/…` family, which the caller must resolve
 * first and then hand to `mapLegacySiteRest`.
 */
export function mapLegacyBrandRest(
  brandSeg: string,
  rest: readonly string[],
  query: URLSearchParams,
): string | null {
  const brandBase = `/marketing/${brandSeg}`;
  const section = rest[0] ?? "";
  const sub = rest.slice(1);
  if (section === "sites") return null;
  if (section === "") return withQuery(brandBase, query);

  // The asset desk became the Identity section's media room; its four `?view=`
  // tabs became routes (Library is the index).
  if (section === "assets" && sub.length === 0) {
    const view = readView(query);
    const path =
      view && BRAND_ASSET_VIEWS.has(view)
        ? `${brandBase}/identity/media/${view}`
        : `${brandBase}/identity/media`;
    return withQuery(path, view ? withoutView(query) : query);
  }
  if (section === "discovery") {
    return withQuery(
      `${brandBase}/inbox${sub.length ? `/${sub.join("/")}` : ""}`,
      query,
    );
  }
  if (section === "local") {
    return withQuery(
      `${brandBase}/locations${sub.length ? `/${sub.join("/")}` : ""}`,
      query,
    );
  }
  // settings and anything else keep their name under the brand.
  return withQuery(`${brandBase}/${rest.join("/")}`, query);
}
