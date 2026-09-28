"use client";

import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";

import { AiVisibilityPanelsView } from "./AiVisibilityPanelsView";

export function SiteAiVisibilityPanels() {
  const { site, brandId } = useMarketingSite();
  return <AiVisibilityPanelsView site={site} brandId={brandId} />;
}
