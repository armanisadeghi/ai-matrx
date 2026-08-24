"use client";

/**
 * The per-site keywords workspace shell — four views on one route:
 *   Start here      — THE KEYWORD FRONT DOOR (`KeywordStartHere`): the map of
 *                     every screen that gives keywords meaning, each a door
 *                     with a sentence saying what you do there. It renders at
 *                     the BARE `…/keywords` URL on purpose — Arman,
 *                     2026-08-24: "I need to know where to go."
 *   Performance     — persisted GSC/Bing query evidence + market data
 *                     (`SiteKeywordPerformanceWorkspace`, the original page).
 *   Workbench       — THE assignment surface (C14): search without limits,
 *                     select individually or in bulk, assign a value (adding
 *                     one on the spot when it does not exist) with the reason
 *                     that teaches the system, dynamic dimension columns, and
 *                     saved views as tabs.
 *   Teach classes   — the dedicated traffic-class TEACHING surface
 *                     (`?view=classification`, `KeywordClassificationWorkspace`,
 *                     search-console feature — it powers Traffic quality /
 *                     Shifts / Juice). It did NOT fold into the Workbench in
 *                     C18: it uniquely owns the class matchers (patterns), the
 *                     brand names, the business guidelines every AI run reads,
 *                     CSV import/export and the batch AI classifier. Its label
 *                     now names that job; the `view` id stays `classification`
 *                     because it is URL state every share link means.
 *
 * The views are declared in `lib/site-subviews.ts` and rendered by the SITE
 * HEADER, which owns switching. This file only reads which one is active, so
 * `?view=classification` still deep-links straight into the review queue with
 * its filters intact.
 */

import { KeywordClassificationWorkspace } from "@/features/marketing/search-console/components/classification/KeywordClassificationWorkspace";
import { KeywordStartHere } from "@/features/marketing/seo/value-system/KeywordStartHere";
import { KeywordWorkbench } from "@/features/marketing/seo/keyword-workbench/components/KeywordWorkbench";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { useMarketingSubView } from "@/features/marketing/lib/useMarketingSubView";
import { SiteKeywordPerformanceWorkspace } from "./SiteKeywordPerformanceWorkspace";

export function SiteKeywordsView() {
  const view = useMarketingSubView("keywords");

  return (
    <div className="flex h-full min-h-0 flex-col">
      {view === "start" ? (
        <StartHereRouteMount />
      ) : view === "classification" ? (
        <ClassificationRouteMount />
      ) : view === "workbench" ? (
        <div className="min-h-0 flex-1">
          <KeywordWorkbench />
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <SiteKeywordPerformanceWorkspace />
        </div>
      )}
    </div>
  );
}

function StartHereRouteMount() {
  const { site, brandId } = useMarketingSite();
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-textured">
      <KeywordStartHere
        brandId={brandId}
        siteId={site.id}
        siteDomain={site.domain}
      />
    </main>
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
