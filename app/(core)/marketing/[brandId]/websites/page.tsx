import { Suspense } from "react";
import {
  SitesPortfolioLoading,
} from "@/features/marketing/components/sites/SitesPortfolio";
import { BrandScopedSitesPortfolio } from "@/features/marketing/components/sites/BrandScopedSitesPortfolio";

/**
 * This brand's websites — the client workspace's Properties door.
 *
 * 🚨 Mounts the canonical portfolio table SCOPED TO THIS BRAND (2026-08-30).
 * It previously mounted `SitesPortfolio` unscoped, with a comment
 * acknowledging that no brand-scoped list existed and deferring the work — so
 * a client's own workspace listed every OTHER client's websites (15 sites
 * across 14 brands inside All Green Recycling's shell). The scope is now a
 * prop on the same canonical table; there is still exactly one table.
 */
export default function MarketingBrandWebsitesPage() {
  return (
    <Suspense fallback={<SitesPortfolioLoading />}>
      <BrandScopedSitesPortfolio />
    </Suspense>
  );
}
