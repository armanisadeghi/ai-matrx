"use client";

/**
 * FindingsAssistStrip — the analysis surfaces' inline assist chips.
 *
 * Renders THIS site's background-produced assists through the canonical
 * per-page AssistStrip (never a forked chip component). The scheduled database
 * producer writes the same rows the global AssistsDock reads; deciding a chip
 * in either place clears both — one ledger, one slice.
 *
 * Mounted on every surface where findings are actually read (the register,
 * the priority queue, the audit workspace). All three show the same rows on
 * purpose: the finding is the thing, not the tab it was noticed on.
 */

import { useCallback } from "react";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import type { Assist } from "@/features/assists/types";
import {
  FINDINGS_ASSIST_SURFACE,
  isFindingAssist,
} from "@/features/marketing/findings-assists-producer";

export function FindingsAssistStrip({
  siteId,
  className,
}: {
  siteId: string;
  className?: string;
}) {
  const siteFilter = useCallback(
    (assist: Assist) => isFindingAssist(assist, siteId),
    [siteId],
  );

  return (
    <AssistStrip
      surfaceName={FINDINGS_ASSIST_SURFACE}
      filter={siteFilter}
      className={className}
    />
  );
}
