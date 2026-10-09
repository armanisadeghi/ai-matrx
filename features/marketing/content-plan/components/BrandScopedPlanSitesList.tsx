"use client";

/**
 * The brand workspace's content-plan list — the canonical `PlanSitesList`,
 * scoped to the brand in context.
 *
 * Without this the list showed every site the viewer can plan across every org
 * and every client, so one client's Content Plan page listed another client's
 * websites and their plan coverage.
 *
 * The brand comes from `MarketingBrandProvider` (a real UUID), never from the
 * route param — the param is an address and is usually a key.
 */

import { useMarketingBrand } from "@/features/marketing/lib/brand-context";

import { useBrandSites } from "@/features/marketing/data/hooks";
import { NoWebsiteState } from "@/features/marketing/components/shared/NoWebsiteState";
import { marketingRoutes } from "@/features/marketing/lib/routes";

import { PlanSitesList } from "./PlanSitesList";

export function BrandScopedPlanSitesList() {
  const brand = useMarketingBrand();
  const sites = useBrandSites(brand.id);
  // The content plan writes pages of a website. A brand with none plans on the topical map
  // (brand-level) and in Socials, so say that instead of showing an empty list.
  if (sites.isSuccess && (sites.data ?? []).length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <NoWebsiteState
          brandId={brand.id}
          brandName={brand.name}
          needs="writing and publishing pages"
          alternatives={[
            { label: "Plan on the topical map", href: marketingRoutes.brandTopicalMapHome(brand.id) },
            { label: "Open Socials", href: marketingRoutes.brandSocials(brand.id) },
          ]}
        />
      </div>
    );
  }
  return <PlanSitesList brandId={brand.id} />;
}
