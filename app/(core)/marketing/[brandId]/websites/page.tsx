import { Suspense } from "react";
import {
  SitesPortfolio,
  SitesPortfolioLoading,
} from "@/features/marketing/components/sites/SitesPortfolio";

/**
 * This brand's websites — the client workspace's Properties door.
 *
 * Mounts the canonical portfolio table (moved here from `/marketing/sites`).
 * `SitesPortfolio` reads the whole readable portfolio today: no brand-scoped
 * list component exists, and scoping it would mean threading a brand filter
 * through `useSites` → `listSites` → the shared table query state. Noted for
 * the restructure's follow-up rather than forked into a second table.
 */
export default function MarketingBrandWebsitesPage() {
  return (
    <Suspense fallback={<SitesPortfolioLoading />}>
      <SitesPortfolio />
    </Suspense>
  );
}
