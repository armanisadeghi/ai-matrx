"use client";

/**
 * PlanAssistStrip — the Content Plan workspace's inline assist chips.
 *
 * Runs the deterministic missing-pages sweep (plan-assists-producer.ts)
 * once per site per browser session over data the workbench already loaded
 * (plan nodes × the WF-11 CMS page map — zero extra reads), then renders
 * THIS site's pending assists through the canonical per-page AssistStrip
 * (never a forked chip component). The same rows also appear in the global
 * AssistsDock; deciding a chip in either place clears both — one ledger,
 * one slice.
 */

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import type { Assist } from "@/features/assists/types";
import type { CmsPageMapEntry } from "../setup/bridge";
import type { PlanNodeRow } from "../types";
import {
  PLAN_ASSIST_SURFACE,
  isPlanAssist,
  producePlanAssists,
} from "../plan-assists-producer";

/** Sites whose page gap was found this browser session — once the producer
 * has run its ledger round-trip there is nothing more to notice until the
 * next session. With no gap we deliberately do NOT latch, so nodes planned
 * later in the session are still noticed (the re-checks are pure in-memory —
 * the producer touches no network without a gap). Module-scoped on purpose. */
const sweptSites = new Set<string>();

export function PlanAssistStrip({
  siteId,
  siteLabel,
  nodeRows,
  pagesByNodeId,
  /** Gate: only sweep once nodes are loaded AND the site has a paired CMS
   * site (unpaired = normal state, never a finding). */
  enabled,
  className,
}: {
  siteId: string | null;
  siteLabel: string | null;
  nodeRows: readonly PlanNodeRow[];
  pagesByNodeId: ReadonlyMap<string, CmsPageMapEntry>;
  enabled: boolean;
  className?: string;
}) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const siteFilter = (a: Assist) => (siteId ? isPlanAssist(a, siteId) : false);

  useEffect(() => {
    if (!enabled || !siteId || !userId) return;
    if (sweptSites.has(siteId)) return;
    // Latch synchronously (no concurrent double-run), un-latch when no gap
    // exists so nodes planned later in the session are still noticed.
    sweptSites.add(siteId);
    void producePlanAssists({
      siteId,
      siteLabel: siteLabel ?? siteId,
      nodeRows,
      pagesByNodeId,
      userId,
      dispatch,
    }).then((gapFound) => {
      if (!gapFound) sweptSites.delete(siteId);
    });
  }, [enabled, siteId, siteLabel, nodeRows, pagesByNodeId, userId, dispatch]);

  return (
    <AssistStrip
      surfaceName={PLAN_ASSIST_SURFACE}
      filter={siteFilter}
      className={className}
    />
  );
}
