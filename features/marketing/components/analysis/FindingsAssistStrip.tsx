"use client";

/**
 * FindingsAssistStrip — the analysis surfaces' inline assist chips.
 *
 * Runs the deterministic findings sweep (findings-assists-producer.ts) once
 * per site per session, then renders THIS site's pending assists through the
 * canonical per-page AssistStrip (never a forked chip component). The same
 * rows also appear in the global AssistsDock; deciding a chip in either place
 * clears both — one ledger, one slice.
 *
 * Mounted on every surface where findings are actually read (the register,
 * the priority queue, the audit workspace). All three show the same rows on
 * purpose: the finding is the thing, not the tab it was noticed on.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import type { Assist } from "@/features/assists/types";
import {
  FINDINGS_ASSIST_SURFACE,
  isFindingAssist,
  produceFindingAssists,
} from "@/features/marketing/findings-assists-producer";

/** One sweep per site per browser session — revisiting the register must not
 * re-read it on every mount. Module-scoped on purpose. */
const sweptSites = new Set<string>();

export function FindingsAssistStrip({
  siteId,
  sitePath,
  siteDomain,
  className,
}: {
  siteId: string;
  /** Brand-first base path for this site (the rollup chip's door). */
  sitePath: string;
  siteDomain: string | null;
  className?: string;
}) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const siteFilter = useCallback(
    (assist: Assist) => isFindingAssist(assist, siteId),
    [siteId],
  );

  useEffect(() => {
    if (!siteId || !userId) return;
    if (sweptSites.has(siteId)) return;
    sweptSites.add(siteId);
    void produceFindingAssists({
      siteId,
      sitePath,
      siteDomain,
      userId,
      dispatch,
    });
  }, [siteId, sitePath, siteDomain, userId, dispatch]);

  return (
    <AssistStrip
      surfaceName={FINDINGS_ASSIST_SURFACE}
      filter={siteFilter}
      className={className}
    />
  );
}
