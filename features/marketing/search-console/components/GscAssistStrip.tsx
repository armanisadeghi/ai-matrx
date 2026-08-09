"use client";

/**
 * GscAssistStrip — the Search Console dashboard's inline assist chips.
 *
 * Runs the deterministic insight sweep (insights-assists-producer.ts) once
 * per site per session, then renders THIS site's pending assists as the
 * canonical AssistChip row (never a forked chip component). The same rows
 * also appear in the global AssistsDock; deciding a chip in either place
 * clears both — one ledger, one slice.
 */

import { useEffect, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { AssistChip } from "@/features/assists/components/AssistChip";
import {
  fetchMyAssists,
  selectAssistsForSurface,
  selectAssistsLoaded,
} from "@/features/assists/redux/assistsSlice";
import type { RootState } from "@/lib/redux/store";
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
  const surfaceAssists = useAppSelector((state: RootState) =>
    selectAssistsForSurface(state, GSC_ASSIST_SURFACE),
  );
  const assists = useMemo(
    () =>
      siteId
        ? surfaceAssists.filter((a) => isGscInsightAssist(a, siteId))
        : [],
    [surfaceAssists, siteId],
  );

  // Rows from earlier sessions: make sure the slice is hydrated even if the
  // (deferred) global dock hasn't fetched yet. Same guard as the dock — the
  // `loaded` flag keeps this to at most one fetch either way.
  const assistsLoaded = useAppSelector(selectAssistsLoaded);
  useEffect(() => {
    if (userId && !assistsLoaded) void dispatch(fetchMyAssists({ userId }));
  }, [userId, assistsLoaded, dispatch]);

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

  if (assists.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {assists.map((assist) => (
        <AssistChip key={assist.id} assist={assist} />
      ))}
    </div>
  );
}
