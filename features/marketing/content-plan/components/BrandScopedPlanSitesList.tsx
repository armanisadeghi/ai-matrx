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

import { PlanSitesList } from "./PlanSitesList";

export function BrandScopedPlanSitesList() {
  const brand = useMarketingBrand();
  return <PlanSitesList brandId={brand.id} />;
}
