"use client";

/**
 * The Review tab's brief — THE canonical site brief, mounted in place.
 *
 * Until 2026-09-14 this card was a second UI over `seo.landscape_brief` with
 * its own browser-side write path (guidance written direct to the row while
 * the server had a ruling route) and its own generate call to a route that no
 * longer exists. The brief is now the platform's brand strategy + site brief
 * (`features/marketing/strategy/`), and the competitor classifier reads the
 * composed guidance server-side — so this card WRAPS the canonical workspace
 * (a panel wraps the canonical component, never a hand-rolled copy).
 *
 * Brand segment: the address system is dual-mode (key or UUID); the autopsy
 * only knows the brand's id, and the brand layout canonicalises it.
 */
import { StrategyBriefWorkspace } from "@/features/marketing/strategy/components/StrategyBriefWorkspace";

import type { CompetitorSite } from "./data";

export function LandscapeBriefCard({
  site,
}: {
  site: CompetitorSite | null;
  /** Kept for the caller; the workspace refreshes its own reads. */
  onGuidanceSaved?: () => Promise<void> | void;
}) {
  if (!site) return null;
  if (!site.brand_id) {
    return (
      <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
        This site is not under a brand yet, so it has no brief. Assign its brand
        in the site settings and the brief appears here.
      </p>
    );
  }
  return (
    <StrategyBriefWorkspace
      scope="site"
      id={site.id}
      brandId={site.brand_id}
      brandSeg={site.brand_id}
      organizationId={site.organization_id}
    />
  );
}
