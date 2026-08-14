/**
 * Findings-assist producer contract.
 *
 * Production is intentionally NOT a React effect. The canonical producer is
 * `private.sweep_marketing_finding_assists()` in Matrx Main, scheduled by
 * pg_cron every 15 minutes. It groups open findings by site + check, ranks by
 * severity/scope/recency, and keeps at most three pending groups per site in
 * the existing `platform.assists` ledger.
 *
 * This frontend module owns only the shared surface name and the exact filter
 * used by the display-only strip. The action remains the canonical `navigate`
 * assist action: clicking a chip expands it; only its explicit Review findings
 * button opens the filtered register.
 */

import type { Assist } from "@/features/assists/types";

const SOURCE_PREFIX = "seo.finding_rollup.";

export const FINDINGS_ASSIST_SURFACE = "matrx-user/marketing-findings";

export function isFindingAssist(assist: Assist, siteId: string): boolean {
  return (
    assist.sourceKey.startsWith(SOURCE_PREFIX) &&
    assist.entityType === "web_site" &&
    assist.entityId === siteId
  );
}
