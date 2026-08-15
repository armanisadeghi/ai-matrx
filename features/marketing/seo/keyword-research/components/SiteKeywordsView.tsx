"use client";

/**
 * The per-site keywords workspace shell — two views on one route:
 *   Performance     — persisted GSC/Bing query evidence + market data
 *                     (`SiteKeywordPerformanceWorkspace`, the original page).
 *   Classification  — the dedicated traffic-class truth-editing surface
 *                     (`KeywordClassificationWorkspace`, search-console
 *                     feature — it powers Traffic quality / Shifts / Juice).
 *
 * The views are declared in `lib/site-subviews.ts` and rendered by the SITE
 * HEADER, which owns switching. This file only reads which one is active, so
 * `?view=classification` still deep-links straight into the review queue with
 * its filters intact.
 */

import { KeywordClassificationWorkspace } from "@/features/marketing/search-console/components/classification/KeywordClassificationWorkspace";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { useMarketingSubView } from "@/features/marketing/lib/useMarketingSubView";
import { SiteKeywordPerformanceWorkspace } from "./SiteKeywordPerformanceWorkspace";

export function SiteKeywordsView() {
  const view = useMarketingSubView("keywords");

  return (
    <div className="flex h-full min-h-0 flex-col">
      {view === "classification" ? (
        <ClassificationRouteMount />
      ) : (
        <div className="min-h-0 flex-1">
          <SiteKeywordPerformanceWorkspace />
        </div>
      )}
    </div>
  );
}

function ClassificationRouteMount() {
  const { site } = useMarketingSite();
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-textured p-3 sm:p-4">
      <KeywordClassificationWorkspace
        siteId={site.id}
        siteDomain={site.domain}
        organizationId={site.organization_id}
      />
    </main>
  );
}
