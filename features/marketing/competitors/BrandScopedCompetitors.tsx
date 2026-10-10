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
import { isPersonBrand } from "@/features/marketing/lib/brand-kind";
import { useBrandSites } from "@/features/marketing/data/hooks";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { NoWebsiteState } from "@/features/marketing/components/shared/NoWebsiteState";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { BrandCompetitorDirectory } from "./BrandCompetitorDirectory";
import CompetitorAutopsyWorkspace from "./CompetitorAutopsyWorkspace";

const DIRECTORY_VIEWS: ReadonlySet<string> = new Set(["all", "competitors"]);

export function BrandScopedCompetitors({
  view,
}: {
  /**
   * The competitor screen fixed by the ROUTE — the brand tree gives each one
   * its own URL (`…/intelligence/competitors/{review,opportunities,
   * competitors,evidence,history}`; the bare route is Run). Left out, the
   * workspace still reads `?view=` (legacy links).
   */
  view?: string;
} = {}) {
  const brand = useMarketingBrand();
  const sites = useBrandSites(brand.id);

  if (sites.isPending) return <LoadingSurface label="Loading websites…" />;
  if (sites.isError) return <QueryError error={sites.error} />;

  // A brand with no website still has competitors: the social ones. The directory works without
  // a site; the website analysis screens need one. A person brand's peers are always the
  // directory: the autopsy screens are a company-website practice.
  const socialOnly = isPersonBrand(brand) || (sites.data ?? []).length === 0;
  if (socialOnly) {
    // The directory answers the list screens; the other modes are the website competitor
    // analysis, so they say so instead of repeating the directory six times.
    if (!view || DIRECTORY_VIEWS.has(view)) return <BrandCompetitorDirectory />;
    return (
      <div className="p-3 pt-[calc(var(--shell-header-h)+0.75rem)]">
        <NoWebsiteState
          compact
          brandId={brand.id}
          brandName={brand.name}
          needs="the competitor website analysis"
          alternatives={[{ label: "Open competitor list", href: marketingRoutes.brandCompetitors(brand.id) }]}
        />
      </div>
    );
  }

  return <CompetitorAutopsyWorkspace brandId={brand.id} view={view} />;
}
