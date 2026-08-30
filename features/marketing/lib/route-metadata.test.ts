import { generateSVGFavicon, svgToDataURI } from "@/utils/favicon-utils";
import { getMarketingRouteMetadata } from "./route-metadata";

const B = "/marketing/acme";
const W = `${B}/websites/acme-com`;
const S = `${B}/seo/acme-com`;

const ROUTES = [
  ["/marketing", "Mk"],
  ["/marketing/admin", "Ad"],
  ["/marketing/brands", "Br"],
  ["/marketing/brands/new-website", "Ns"],
  ["/marketing/reports", "Rp"],
  ["/marketing/reports/cost", "Co"],
  ["/marketing/reports/ranks", "Rk"],
  ["/marketing/operations", "Os"],
  ["/marketing/operations/connections", "Cn"],
  ["/marketing/operations/connections/google", "Gg"],
  ["/marketing/operations/connections/google/read-only", "Ro"],
  ["/marketing/operations/connections/bing", "Bi"],
  ["/marketing/operations/automations", "At"],
  ["/marketing/operations/approvals", "Ap"],
  ["/marketing/operations/data-quality", "Dq"],
  ["/marketing/tools", "Tl"],
  ["/marketing/tools/youtube", "Yt"],
  ["/marketing/tools/youtube/videos/video-1", "Yv"],
  // The client workspace
  [B, "Bo"],
  [`${B}/identity`, "Id"],
  [`${B}/identity/media`, "Ba"],
  [`${B}/identity/knowledge`, "Bk"],
  [`${B}/identity/offerings`, "Of"],
  [`${B}/identity/guidelines`, "Gu"],
  [`${B}/identity/audience`, "Ae"],
  [`${B}/locations`, "Lc"],
  [`${B}/locations/location-1`, "Ll"],
  [`${B}/inbox`, "In"],
  [`${B}/settings`, "St"],
  [`${B}/socials`, "Sa"],
  [`${B}/content`, "Ce"],
  [`${B}/content/plan/acme-com`, "Pn"],
  [`${B}/email`, "Em"],
  [`${B}/pr`, "Pr"],
  [`${B}/ads`, "Az"],
  [`${B}/intelligence/competitors`, "Cm"],
  [`${B}/intelligence/monitoring`, "Mo"],
  [`${B}/intelligence/reputation`, "Ru"],
  [`${B}/analytics`, "Ay"],
  [`${B}/planning`, "Pl"],
  [`${B}/planning/initiatives/initiative-1`, "It"],
  [`${B}/planning/calendar`, "Cy"],
  // Website inventory
  [W, "So"],
  [`${W}/pages`, "Pg"],
  [`${W}/pages/page-1`, "Pd"],
  [`${W}/pages/page-1/snapshots`, "Ph"],
  [`${W}/pages/page-1/snapshots/snapshot-1`, "Sn"],
  [`${W}/structure`, "Tr"],
  [`${W}/sitemaps`, "Sm"],
  [`${W}/sitemaps/sitemap-1`, "Sd"],
  [`${W}/media`, "Me"],
  [`${W}/crawls`, "Cr"],
  [`${W}/crawls/new`, "Nc"],
  [`${W}/crawls/crawl-1`, "Cd"],
  [`${W}/crawls/crawl-1/links`, "Cl"],
  [`${W}/crawls/crawl-1/logs`, "Cg"],
  [`${W}/crawls/crawl-1/snapshots`, "Cs"],
  [`${W}/crawls/crawl-1/urls`, "Cu"],
  [`${W}/crawls/crawl-1/reports`, "Cw"],
  [`${W}/crawls/crawl-1/reports/response-codes`, "Rc"],
  [`${W}/crawls/crawl-1/reports/performance`, "Pf"],
  [`${W}/settings`, "Se"],
  // SEO practice
  [S, "Sr"],
  [`${S}/keywords`, "Kw"],
  [`${S}/keywords/value`, "Vl"],
  [`${S}/rankings`, "Rn"],
  [`${S}/search-console`, "Sc"],
  [`${S}/audit`, "Au"],
  [`${S}/findings`, "Fi"],
  [`${S}/findings/finding-1`, "Fd"],
  [`${S}/analysis`, "An"],
  [`${S}/coverage`, "Cv"],
  [`${S}/performance`, "Ps"],
  [`${S}/changes`, "Ch"],
  [`${S}/backlinks`, "Bl"],
  [`${S}/links`, "Ln"],
  [`${S}/authority`, "Ar"],
  [`${S}/valuation`, "Lv"],
  [`${S}/ai-visibility`, "Av"],
  [`${S}/growth-loop`, "Gl"],
  [`${S}/automations`, "Am"],
  [`${S}/capabilities`, "Cp"],
] as const;

function faviconDataUri(pathname: string): string {
  const icons = getMarketingRouteMetadata(pathname).icons;
  if (
    !icons ||
    typeof icons === "string" ||
    icons instanceof URL ||
    Array.isArray(icons)
  ) {
    return "";
  }
  const icon = icons.icon;
  if (!Array.isArray(icon)) return "";
  const first = icon[0];
  if (typeof first === "string") return first;
  if (first instanceof URL) return first.toString();
  return first ? String(first.url) : "";
}

describe("getMarketingRouteMetadata", () => {
  it.each(ROUTES)("gives %s its %s favicon badge", (pathname, letter) => {
    expect(faviconDataUri(pathname)).toBe(
      svgToDataURI(generateSVGFavicon({ color: "#15803d", letter })),
    );
  });

  it("uses a distinct favicon for every canonical Marketing leaf", () => {
    const canonical = ROUTES.filter(
      ([pathname]) => !pathname.startsWith("/marketing/sites/site-1"),
    );
    expect(
      new Set(canonical.map(([pathname]) => faviconDataUri(pathname))).size,
    ).toBe(canonical.length);
  });

  it("normalizes query strings and trailing slashes", () => {
    expect(faviconDataUri("/marketing/sites/?page=2")).toBe(
      faviconDataUri("/marketing/sites"),
    );
  });
});
