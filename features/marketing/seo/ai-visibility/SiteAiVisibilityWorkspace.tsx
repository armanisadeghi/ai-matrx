"use client";

import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";

import { AiVisibilityWorkspace } from "./AiVisibilityWorkspace";

export function SiteAiVisibilityWorkspace() {
  const { site, sitePath } = useMarketingSite();
  return <AiVisibilityWorkspace site={site} sitePath={sitePath} />;
}
