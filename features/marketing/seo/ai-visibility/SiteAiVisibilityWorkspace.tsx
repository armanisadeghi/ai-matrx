"use client";

import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";

import { AiVisibilityWorkspace } from "./AiVisibilityWorkspace";
import type { AiVisibilityEvidenceView } from "./evidence-views";

export function SiteAiVisibilityWorkspace({
  evidenceView,
}: {
  evidenceView?: AiVisibilityEvidenceView;
}) {
  const { site, sitePath } = useMarketingSite();
  return (
    <AiVisibilityWorkspace
      site={site}
      sitePath={sitePath}
      evidenceView={evidenceView}
    />
  );
}
