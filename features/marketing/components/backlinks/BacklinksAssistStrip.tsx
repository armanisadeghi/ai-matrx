"use client";

/** Site-filtered page-layer assists for the Backlinks workspace. */

import { useCallback, useEffect } from "react";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import type { Assist } from "@/features/assists/types";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import type {
  BacklinkObservationRow,
  BacklinkTrendPoint,
  BacklinkWorkspaceData,
} from "@/features/marketing/data/backlinks-types";
import {
  BACKLINKS_ASSIST_SURFACE,
  isBacklinksAssist,
  produceBacklinksAssists,
} from "@/features/marketing/components/backlinks/backlinks-assists-producer";

/** One deterministic sweep per site per browser session. */
const sweptSites = new Set<string>();

export function BacklinksAssistStrip({
  siteId,
  siteLabel,
  sitePath,
  brandNames,
  data,
  trend,
  rows,
  reviewEnabled,
  ready,
}: {
  siteId: string;
  siteLabel: string;
  sitePath: string;
  brandNames: string[];
  data: BacklinkWorkspaceData;
  trend: BacklinkTrendPoint[];
  rows: BacklinkObservationRow[];
  reviewEnabled: boolean;
  /** Wait until all three already-mounted reads have settled so a partial
   * first render cannot suppress a real candidate for the whole session. */
  ready: boolean;
}) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const siteFilter = useCallback(
    (assist: Assist) => isBacklinksAssist(assist, siteId),
    [siteId],
  );

  useEffect(() => {
    if (!ready || !userId || sweptSites.has(siteId)) return;
    sweptSites.add(siteId);
    void produceBacklinksAssists({
      userId,
      dispatch,
      state: {
        siteId,
        siteLabel,
        sitePath,
        brandNames,
        summary: data.latestByDataset.summary ?? null,
        detailSnapshot: data.latestByDataset.backlinks ?? null,
        trend,
        rows,
        anchors: data.anchors,
        targetPages: data.targetPages,
        competitors: data.competitors,
        enrichment: data.enrichment,
        reviewEnabled,
      },
    });
  }, [
    ready,
    userId,
    siteId,
    siteLabel,
    sitePath,
    brandNames,
    data,
    trend,
    rows,
    reviewEnabled,
    dispatch,
  ]);

  return (
    <AssistStrip
      surfaceName={BACKLINKS_ASSIST_SURFACE}
      filter={siteFilter}
      className="shrink-0 border-b border-border px-3 py-1.5 sm:px-4"
    />
  );
}
