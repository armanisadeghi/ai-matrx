"use client";

/**
 * The brand door into COMPETITORS.
 *
 * 🚨 WHY THIS EXISTS (2026-08-30). `/marketing/<brand>/intelligence/competitors`
 * mounted `CompetitorAutopsyWorkspace` with NO scope at all. The workspace
 * takes its site from `?siteId`, and the brand route never sets one, so it fell
 * back to `sites.data[0]` — the first site on the PLATFORM. Every brand's
 * competitors page therefore rendered a different client's data: All Green
 * Recycling (12 competitors) showed aimatrx.com's 3 and an executive verdict
 * about study.com and britannica.com. Nothing warned anyone; the numbers just
 * belonged to someone else.
 *
 * The brand comes from `MarketingBrandProvider` (a real UUID), never from the
 * route param — the param is an address and is usually a key.
 */

import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { useBrandSites } from "@/features/marketing/data/hooks";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import CompetitorAutopsyWorkspace from "./CompetitorAutopsyWorkspace";

export function BrandScopedCompetitors() {
  const brand = useMarketingBrand();
  const sites = useBrandSites(brand.id);

  if (sites.isPending) return <LoadingSurface label="Loading websites…" />;
  if (sites.isError) return <QueryError error={sites.error} />;

  if ((sites.data ?? []).length === 0) {
    return (
      <div className="p-4">
        <p className="rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          Competitors are found per website, and {brand.name} has no website
          connected yet. Add one to this brand and the competitor search turns
          on immediately.
        </p>
      </div>
    );
  }

  return <CompetitorAutopsyWorkspace brandId={brand.id} />;
}
