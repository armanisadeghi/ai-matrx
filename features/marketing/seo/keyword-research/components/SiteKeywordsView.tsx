"use client";

/**
 * The per-site keywords workspace shell — three views on one route:
 *   Start here   — THE KEYWORD FRONT DOOR (`KeywordStartHere`): the map of
 *                  every screen that gives keywords meaning, each a door
 *                  with a sentence saying what you do there. It renders at
 *                  the BARE `…/keywords` URL on purpose — Arman,
 *                  2026-08-24: "I need to know where to go."
 *   Performance  — persisted GSC/Bing query evidence + market data
 *                  (`SiteKeywordPerformanceWorkspace`, the original page).
 *   Workbench    — THE assignment surface (C14): search without limits,
 *                  select individually or in bulk, assign a value (adding
 *                  one on the spot when it does not exist) with the reason
 *                  that teaches the system, dynamic dimension columns, and
 *                  saved views as tabs.
 *
 * `?view=classification` ("Teach classes") folded into the Workbench and was
 * deleted 2026-08-25 (KI-036): the Workbench reached parity on assignment,
 * and the three things only the old view owned found real homes — the
 * business-guidelines editor at `/value/guidelines`, the brand-alias panel
 * inside THE MATCHER EDITOR (`/value/dimensions`), and the class-rule panel
 * retired with the Rulebook (`/value/rules`). An old `?view=classification`
 * bookmark lands here on the Workbench instead — never a crash, never a dead
 * view.
 *
 * The views are declared in `lib/site-subviews.ts` and rendered by the SITE
 * HEADER, which owns switching. This file only reads which one is active.
 */

import { useSearchParams } from "next/navigation";
import { KeywordStartHere } from "@/features/marketing/seo/value-system/KeywordStartHere";
import { KeywordWorkbench } from "@/features/marketing/seo/keyword-workbench/components/KeywordWorkbench";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { useMarketingSubView } from "@/features/marketing/lib/useMarketingSubView";
import { SiteKeywordPerformanceWorkspace } from "./SiteKeywordPerformanceWorkspace";

export function SiteKeywordsView() {
  const view = useMarketingSubView("keywords");
  // A retired `?view=classification` link (and its legacy `?tab=classification`
  // alias) is a legitimate old bookmark, not a typo — send it to the
  // Workbench rather than falling all the way back to "Start here".
  const searchParams = useSearchParams();
  const isLegacyClassificationLink =
    (searchParams.get("view") ?? searchParams.get("tab")) === "classification";
  const effectiveView = isLegacyClassificationLink ? "workbench" : view;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {effectiveView === "start" ? (
        <StartHereRouteMount />
      ) : effectiveView === "workbench" ? (
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
