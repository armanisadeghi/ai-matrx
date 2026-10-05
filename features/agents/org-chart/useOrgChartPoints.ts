// features/agents/org-chart/useOrgChartPoints.ts
//
// The org chart's optional POINTS view: what each agent, and each branch under a
// box, has spent over the window (knob agents.org_chart.points_window_days).
// Read only while the view is on. Source: chat.user_request.total_cost (USD as the
// server reported it) — always SHOWN through <Cost/>, so a person sees points and
// never our dollars.

"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import { knobInt } from "@/lib/knobs/featureKnobs";
import type { OrgChartTreeNode } from "@/components/official/org-chart/layout";
import type { AgentOrgNodeData } from "./buildAgentOrgForest";
import { ORG_CHART_READ_CHUNK } from "./constants";

/** USD spent per agent over the window, or the reason it could not be read. */
export function useOrgChartPoints(agentIds: readonly string[], enabled: boolean) {
  const [byAgent, setByAgent] = useState<Record<string, number> | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idsKey = [...new Set(agentIds)].sort().join(",");

  useEffect(() => {
    if (!enabled || !idsKey) return;
    let live = true;
    void (async () => {
      try {
        const window = await knobInt("agents.org_chart", "points_window_days");
        const since = new Date(Date.now() - window * 86_400_000).toISOString();
        const ids = idsKey.split(",");
        const totals: Record<string, number> = {};
        for (let i = 0; i < ids.length; i += ORG_CHART_READ_CHUNK) {
          const rows = await readAllRows<{ id: string; agent_id: string | null; total_cost: number | null }>(
            ({ from, to }) =>
              supabase
                .schema("chat")
                .from("user_request")
                .select("id, agent_id, total_cost", { count: "exact" })
                .in("agent_id", ids.slice(i, i + ORG_CHART_READ_CHUNK))
                .gte("created_at", since)
                .is("deleted_at", null)
                .order("id", { ascending: true })
                .range(from, to),
            { label: "chat.user_request org chart points" },
          );
          for (const r of rows) {
            if (r.agent_id && typeof r.total_cost === "number") {
              totals[r.agent_id] = (totals[r.agent_id] ?? 0) + r.total_cost;
            }
          }
        }
        if (!live) return;
        setByAgent(totals);
        setDays(window);
        setError(null);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Points could not load.");
      }
    })();
    return () => {
      live = false;
    };
  }, [enabled, idsKey]);

  return { byAgent: enabled ? byAgent : null, days, error: enabled ? error : null };
}

/** Each placement's own spend and its whole branch's (itself + everything under it). */
export function branchTotals(
  forest: readonly OrgChartTreeNode<AgentOrgNodeData>[],
  byAgent: Record<string, number>,
): Record<string, { own: number | null; branch: number }> {
  const out: Record<string, { own: number | null; branch: number }> = {};
  const walk = (n: OrgChartTreeNode<AgentOrgNodeData>): number => {
    const own = n.data.boxType === "agent" ? (byAgent[n.data.entityId] ?? 0) : null;
    const branch = (own ?? 0) + n.children.reduce((sum, c) => sum + walk(c), 0);
    out[n.key] = { own, branch };
    return branch;
  };
  forest.forEach(walk);
  return out;
}

const PointsContext = createContext<Record<string, { own: number | null; branch: number }> | null>(null);
export const OrgChartPointsProvider = PointsContext.Provider;

/** This placement's points, or null while the view is off. */
export function usePlacementPoints(key: string) {
  const all = useContext(PointsContext);
  return all ? (all[key] ?? null) : null;
}
