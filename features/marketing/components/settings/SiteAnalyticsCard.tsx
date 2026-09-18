"use client";

/**
 * The site's Google Analytics section — a DOOR to the canonical panel.
 *
 * Until 2026-09-17 this file carried its own rollup: the 30 most recent
 * `seo.web_analytics_daily` rows, summed per day. Two defects came with that
 * shape and both are gone now that the ONE panel does the reading:
 *   · it summed every collection run for a day, and the busiest live site
 *     carries FIVE runs on most days — up to 5× its real sessions;
 *   · a 30-ROW limit is under one day of rows for that site, so the "last 30
 *     days" table was really the newest few hours.
 * `features/marketing/analytics/window.ts` holds the accuracy rules; a second
 * renderer here would drift from them again (no-legacy: the old body is deleted,
 * not kept beside the new one).
 */

import { SiteAnalyticsPanel } from "@/features/marketing/analytics/components/SiteAnalyticsPanel";
import type { MarketingSite } from "@/features/marketing/types";

export function SiteAnalyticsCard({ site }: { site: MarketingSite }) {
  return <SiteAnalyticsPanel site={site} />;
}
