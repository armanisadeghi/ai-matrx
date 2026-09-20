"use client";

/**
 * The site's Tag Manager tracking section — a DOOR to the canonical panel.
 *
 * It is a pure `<SiteTrackingPanel />` on purpose, exactly like `SiteAnalyticsCard`. That file's
 * docstring records what a second renderer cost the Analytics section (a rollup that summed every
 * collection run for a day, and a 30-ROW limit sold as "the last 30 days"); a tracking verdict has
 * the same failure mode with worse consequences, because a second copy that skips the
 * container-versus-live-page reconciliation would print a confident grade of a container the site
 * does not use.
 */

import { SiteTrackingPanel } from "@/features/marketing/tracking/components/SiteTrackingPanel";
import type { MarketingSite } from "@/features/marketing/types";

export function SiteTrackingCard({ site }: { site: MarketingSite }) {
  return <SiteTrackingPanel site={site} />;
}
