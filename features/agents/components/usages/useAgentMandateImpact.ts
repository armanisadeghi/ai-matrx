/**
 * useAgentMandateImpact — the mandates pinned to ONE agent (and to its
 * duplicated descendants), graded by the server's impact read.
 *
 * The read is the ONE grader (`features/mandates/admin/impact.ts`, R12): this
 * hook only decides the door. A super admin reads through the admin door and
 * sees every rung; anyone else reads through `/mine`, which answers about the
 * mandates they can already see and COUNTS the rest ("N rungs withheld …") so
 * the screen never implies it showed everything.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import {
  fetchImpact,
  type ImpactPosture,
  type StandingImpact,
} from "@/features/mandates/admin/impact";
import type { UsageScope } from "@/features/agents/redux/usages/usages.slice";

export type MandateImpactStatus = "idle" | "loading" | "succeeded" | "failed";

export interface AgentMandateImpact {
  status: MandateImpactStatus;
  error: string | null;
  impact: StandingImpact | null;
  posture: ImpactPosture;
  refresh: () => void;
}

export function useAgentMandateImpact(
  agentId: string | null,
  scope: UsageScope,
): AgentMandateImpact {
  const dispatch = useAppDispatch();
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const posture: ImpactPosture =
    scope === "admin" || isSuperAdmin ? "admin" : "mine";
  const [status, setStatus] = useState<MandateImpactStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [impact, setImpact] = useState<StandingImpact | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    if (!agentId) return;
    const mine = ++generation.current;
    setStatus("loading");
    setError(null);
    try {
      const result = await fetchImpact(dispatch, [agentId], {
        posture,
        includeDescendants: true,
      });
      if (generation.current !== mine) return;
      setImpact(result);
      setStatus("succeeded");
    } catch (caught) {
      if (generation.current !== mine) return;
      setError(caught instanceof Error ? caught.message : "The mandate impact read failed.");
      setStatus("failed");
    }
  }, [agentId, dispatch, posture]);

  useEffect(() => {
    void load();
  }, [load]);

  return { status, error, impact, posture, refresh: () => void load() };
}
