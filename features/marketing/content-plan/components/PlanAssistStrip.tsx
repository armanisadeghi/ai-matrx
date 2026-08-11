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
  produceKeywordAssists,
  producePlanAssists,
} from "../plan-assists-producer";

/** Sites whose page gap was found this browser session — once the producer
 * has run its ledger round-trip there is nothing more to notice until the
 * next session. With no gap we deliberately do NOT latch, so nodes planned
 * later in the session are still noticed (the re-checks are pure in-memory —
 * the producer touches no network without a gap). Module-scoped on purpose. */
const sweptSites = new Set<string>();

/** The keyword sweep's own latch — it runs on a DIFFERENT gate (no CMS pairing
 * required), so sharing one latch would let whichever fired first suppress the
 * other for the rest of the session. */
const keywordSweptSites = new Set<string>();

export function PlanAssistStrip({
  siteId,
  siteLabel,
  nodeRows,
  pagesByNodeId,
  /** Gate: only sweep once nodes are loaded AND the site has a paired CMS
   * site (unpaired = normal state, never a finding). */
  enabled,
  /** Gate for the keyword-gap sweep: nodes loaded, nothing more. A plan with no
   * website still needs its keywords — this must NOT require CMS pairing. */
  keywordSweepEnabled,
  className,
}: {
  siteId: string | null;
  siteLabel: string | null;
  nodeRows: readonly PlanNodeRow[];
  pagesByNodeId: ReadonlyMap<string, CmsPageMapEntry>;
  enabled: boolean;
  keywordSweepEnabled: boolean;
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

  useEffect(() => {
    if (!keywordSweepEnabled || !siteId || !userId) return;
    if (keywordSweptSites.has(siteId)) return;
    keywordSweptSites.add(siteId);
    void produceKeywordAssists({
      siteId,
      siteLabel: siteLabel ?? siteId,
      nodeRows,
      userId,
      dispatch,
    }).then((gapFound) => {
      // Same rule as the page sweep: un-latch with no gap so a page planned
      // later this session is still noticed (the re-check is a pure in-memory
      // scan — no network until a gap exists).
      if (!gapFound) keywordSweptSites.delete(siteId);
    });
  }, [keywordSweepEnabled, siteId, siteLabel, nodeRows, userId, dispatch]);

  return (
    <AssistStrip
      surfaceName={PLAN_ASSIST_SURFACE}
      filter={siteFilter}
      className={className}
    />
  );
}
