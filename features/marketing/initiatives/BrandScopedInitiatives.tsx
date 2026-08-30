"use client";

/**
 * The brand workspace's Initiatives list — the canonical `InitiativesListPage`,
 * opened pre-filtered to the brand in context.
 *
 * Without this the org-scoped list opened on "All brands", so one client's
 * Planning page showed every other client's goals, timelines and budgets.
 *
 * The brand comes from `MarketingBrandProvider` (a real UUID + name), never
 * from the route param — the param is an address and is usually a key.
 */

import { useMarketingBrand } from "@/features/marketing/lib/brand-context";

import { InitiativesListPage } from "./InitiativesListPage";

export function BrandScopedInitiatives() {
  const brand = useMarketingBrand();
  return <InitiativesListPage brandName={brand.name} />;
}
