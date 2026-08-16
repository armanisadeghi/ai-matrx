/**
 * features/marketing/content-plan/lib/measure-door.ts
 *
 * The pure decision behind a plan row's AFTER badge: given the CMS page's
 * measurement join and whatever Search Console standing we have for it, what
 * does the row show, and what does it claim?
 *
 * Kept out of the component so the honest states — the ones that are hard to
 * see on screen today, because no production `client_pages` row carries a
 * `web_page_id` yet — are directly testable. `NodeMeasureDoor` is the thin
 * shell over this.
 */
import type { PageSearchPerformance } from "@/features/marketing/types";

export interface MeasureDoorModel {
  /** The label the badge shows — clicks when we have them, else a verb. */
  label: string;
  /** The full sentence the badge's tooltip makes. */
  title: string;
  /**
   * Whether Search Console actually has rows for this URL. Drives the badge's
   * emphasis, and is NEVER conflated with "zero clicks".
   */
  hasSearchData: boolean;
}

/**
 * `null` = render nothing at all: this page is not joined to a measured
 * `web.page`, so there is no measurement to show and no honest door to offer.
 */
export function measureDoorModel(
  webPageId: string | null,
  performance: PageSearchPerformance | undefined,
): MeasureDoorModel | null {
  if (!webPageId) return null;

  if (!performance) {
    return {
      label: "measure",
      title: "Measured page — its results have not been read yet",
      hasSearchData: false,
    };
  }
  if (!performance.in_gsc) {
    return {
      label: "measure",
      title: "Measured page — no Search Console rows for this URL yet",
      hasSearchData: false,
    };
  }
  const clicks = performance.gsc_clicks_28d ?? 0;
  const impressions = performance.gsc_impressions_28d ?? 0;
  const position = performance.gsc_position_28d;
  return {
    label: clicks.toLocaleString(),
    title: `Last 28 days: ${clicks.toLocaleString()} clicks, ${impressions.toLocaleString()} impressions, average position ${
      position == null ? "—" : position.toFixed(1)
    }`,
    hasSearchData: true,
  };
}
