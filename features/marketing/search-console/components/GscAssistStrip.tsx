"use client";

/**
 * GscAssistStrip — the Search Console dashboard's inline assist chips.
 *
 * Runs the deterministic insight sweep (insights-assists-producer.ts) once
 * per site per session, then renders THIS site's pending assists through the
 * canonical per-page AssistStrip (never a forked chip component). The same rows
 * also appear in the global AssistsDock; deciding a chip in either place
 * clears both — one ledger, one slice.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import type { Assist } from "@/features/assists/types";
import {
  GSC_ASSIST_SURFACE,
  isGscInsightAssist,
  produceGscInsightAssists,
} from "@/features/marketing/search-console/insights-assists-producer";

/** One sweep per site per browser session — revisiting a dashboard must not
 * re-run three RPCs every mount. Module-scoped on purpose. */
const sweptSites = new Set<string>();

export function GscAssistStrip({
  siteId,
  siteLabel,
  dataThrough,
  enabled,
}: {
  siteId: string | null;
  siteLabel: string | null;
  /** Freshest stored data day — null means never synced; no sweep. */
  dataThrough: string | null;
  /** Gate: only sweep a bound site that actually has data. */
  enabled: boolean;
}) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const siteFilter = useCallback(
    (a: Assist) => (siteId ? isGscInsightAssist(a, siteId) : false),
    [siteId],
  );

  useEffect(() => {
    if (!enabled || !siteId || !userId || !dataThrough) return;
    if (sweptSites.has(siteId)) return;
    sweptSites.add(siteId);
    void produceGscInsightAssists({
      siteId,
      siteLabel: siteLabel ?? siteId,
      dataThrough,
      userId,
      dispatch,
    });
  }, [enabled, siteId, siteLabel, dataThrough, userId, dispatch]);

  return <AssistStrip surfaceName={GSC_ASSIST_SURFACE} filter={siteFilter} />;
}
