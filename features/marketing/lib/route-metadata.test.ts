import { generateSVGFavicon, svgToDataURI } from "@/utils/favicon-utils";
import { getMarketingRouteMetadata } from "./route-metadata";

const ROUTES = [
  ["/marketing", "Mk"],
  ["/marketing/admin", "Ad"],
  ["/marketing/brands", "Br"],
  ["/marketing/brands/brand-1", "Bd"],
  ["/marketing/connections", "Cn"],
  ["/marketing/connections/google", "Gg"],
  ["/marketing/cost", "Co"],
  ["/marketing/discovery/youtube", "Yt"],
  ["/marketing/discovery/youtube/videos/video-1", "Yv"],
  ["/marketing/sites", "St"],
  ["/marketing/sites/new", "Ns"],
  ["/marketing/sites/site-1", "Ls"],
  ["/marketing/sites/site-1/pages", "Ls"],
  ["/marketing/brands/brand-1/sites/site-1", "So"],
  ["/marketing/brands/brand-1/sites/site-1/access", "Ac"],
  ["/marketing/brands/brand-1/sites/site-1/analysis", "An"],
  ["/marketing/brands/brand-1/sites/site-1/coverage", "Cv"],
  ["/marketing/brands/brand-1/sites/site-1/crawls", "Cr"],
  ["/marketing/brands/brand-1/sites/site-1/crawls/new", "Nc"],
  ["/marketing/brands/brand-1/sites/site-1/crawls/crawl-1", "Cd"],
  ["/marketing/brands/brand-1/sites/site-1/crawls/crawl-1/links", "Cl"],
  ["/marketing/brands/brand-1/sites/site-1/crawls/crawl-1/logs", "Cg"],
  ["/marketing/brands/brand-1/sites/site-1/crawls/crawl-1/snapshots", "Cs"],
  ["/marketing/brands/brand-1/sites/site-1/crawls/crawl-1/urls", "Cu"],
  ["/marketing/brands/brand-1/sites/site-1/crawls/crawl-1/reports", "Rp"],
  [
    "/marketing/brands/brand-1/sites/site-1/crawls/crawl-1/reports/response-codes",
    "Rc",
  ],
  [
    "/marketing/brands/brand-1/sites/site-1/crawls/crawl-1/reports/page-titles",
    "Pt",
  ],
  [
    "/marketing/brands/brand-1/sites/site-1/crawls/crawl-1/reports/meta-descriptions",
    "Md",
  ],
  [
    "/marketing/brands/brand-1/sites/site-1/crawls/crawl-1/reports/headings",
    "Hd",
  ],
  [
    "/marketing/brands/brand-1/sites/site-1/crawls/crawl-1/reports/canonicals",
    "Ca",
  ],
  [
    "/marketing/brands/brand-1/sites/site-1/crawls/crawl-1/reports/directives",
    "Dr",
  ],
  [
    "/marketing/brands/brand-1/sites/site-1/crawls/crawl-1/reports/images",
    "Im",
  ],
  [
    "/marketing/brands/brand-1/sites/site-1/crawls/crawl-1/reports/content",
    "Ct",
  ],
  [
    "/marketing/brands/brand-1/sites/site-1/crawls/crawl-1/reports/structured-data",
    "Js",
  ],
  [
    "/marketing/brands/brand-1/sites/site-1/crawls/crawl-1/reports/performance",
    "Pf",
  ],
  ["/marketing/brands/brand-1/sites/site-1/discovery", "Di"],
  ["/marketing/brands/brand-1/sites/site-1/findings", "Fi"],
  ["/marketing/brands/brand-1/sites/site-1/findings/finding-1", "Fd"],
  ["/marketing/brands/brand-1/sites/site-1/integrations", "In"],
  ["/marketing/brands/brand-1/sites/site-1/keywords", "Kw"],
  ["/marketing/brands/brand-1/sites/site-1/links", "Ln"],
  ["/marketing/brands/brand-1/sites/site-1/pages", "Pg"],
  ["/marketing/brands/brand-1/sites/site-1/pages/page-1", "Pd"],
  ["/marketing/brands/brand-1/sites/site-1/pages/page-1/snapshots", "Ph"],
  [
    "/marketing/brands/brand-1/sites/site-1/pages/page-1/snapshots/snapshot-1",
    "Sn",
  ],
  ["/marketing/brands/brand-1/sites/site-1/settings", "Se"],
  ["/marketing/brands/brand-1/sites/site-1/sitemaps", "Sm"],
  ["/marketing/brands/brand-1/sites/site-1/sitemaps/sitemap-1", "Sd"],
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
