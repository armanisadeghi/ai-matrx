// The cross-client Search Console roll-up — the site-less portfolio landing
// the old flat `/marketing/search-console` served (its site picker lives
// inside `SearchConsoleGate`). Restored 2026-08-30 after the agency-model
// restructure's smart shim dropped the no-`?site=` mode (adversarial audit
// finding). Per-site dashboards stay canonical at
// `/marketing/[brandId]/seo/[siteId]/search-console` — same component, bound;
// this page is the Reports plane's roll-up door across every client.

import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { SearchConsoleGate } from "@/features/marketing/search-console/components/SearchConsoleGate";

export const metadata: Metadata = {
  title: "Search Console",
  description:
    "The full Search Console dataset across every client — pick a property and drill in.",
};

export default function ReportsSearchConsolePage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading Search Console…" />}>
      <SearchConsoleGate />
    </Suspense>
  );
}
