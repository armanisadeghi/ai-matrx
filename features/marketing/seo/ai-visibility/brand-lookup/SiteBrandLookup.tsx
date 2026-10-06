"use client";

import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";

import { BrandLookupView } from "./BrandLookupView";

export function SiteBrandLookup() {
  const { site, brandId } = useMarketingSite();
  return <BrandLookupView site={site} brandId={brandId} />;
}
