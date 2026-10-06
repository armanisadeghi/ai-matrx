// The reports home is an addition, never a replacement: the site gets a
// Reports section and route, and /marketing/reports keeps its live report with
// a saved-reports section beside it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@/features/marketing/reports/saved/SiteSeoReportsWorkspace", () => ({
  SiteSeoReportsWorkspace: () => <main>site reports</main>,
}));
jest.mock("@/features/marketing/components/shared/MarketingUi", () => ({
  LoadingSurface: () => null,
}));

import SiteReportsRoute from "@/app/(core)/marketing/[brandId]/seo/[siteId]/reports/page";
import { MARKETING_SEO_SECTIONS } from "@/features/marketing/lib/route-sections";
import { marketingRoutes } from "@/features/marketing/lib/routes";

it("the site's SEO branch has a Reports section and route", () => {
  expect(MARKETING_SEO_SECTIONS.map((s) => s.slug)).toContain("reports");
  expect(marketingRoutes.siteReports("acme", "acme-com")).toBe("/marketing/acme/seo/acme-com/reports");
  expect(marketingRoutes.site("acme", "acme-com", "/reports")).toBe("/marketing/acme/seo/acme-com/reports");
  expect(renderToStaticMarkup(<SiteReportsRoute />)).toContain("site reports");
});

it("/marketing/reports keeps the live report and adds the saved section", () => {
  const source = readFileSync(
    join(process.cwd(), "features/marketing/reports/MarketingReportsWorkspace.tsx"),
    "utf8",
  );
  expect(source).toContain("<SavedSeoReportsSection");
  expect(source).toContain("Client search report");
});
