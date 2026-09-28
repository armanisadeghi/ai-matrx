// features/agents/org-chart/orgChartService.ts
//
// Manual org chart links. A THIN layer over the canonical association
// chokepoint (associationsService → assoc_* RPCs) — it owns no mutation path
// and no table. Automatic links are Orchestra member edges and are read and
// written by orchestrasService, never here.
//
// Every method returns a ScopesRpcResult and never throws.

"use client";

import { associationsService } from "@/features/scopes/service/associationsService";
import { isScopesRpcErr, type ScopesRpcResult } from "@/features/scopes/types";
import { err, ok } from "@/features/scopes/service/rpcResult";
import { AGENT_TOKEN, MEMBER_ROLE } from "@/features/agents/orchestras/constants";
import { ORG_CHART_READ_CHUNK, ORG_CHART_ROLE } from "./constants";
import type { ManualOrgEdge } from "./buildAgentOrgForest";

/** PostgREST answers at most this many rows and says nothing when it stops. */
const ROW_CAP = 1000;

type SourceEdges = Awaited<ReturnType<typeof associationsService.listForSources>>;

/**
 * Every agent → agent edge out of `ids`. A read that comes back AT the row cap
 * may have been cut short, so it is split and re-read until each answer is
 * provably whole; a single agent over the cap fails loudly instead of lying.
 */
async function readAgentEdgesWhole(ids: string[]): Promise<SourceEdges> {
  const res = await associationsService.listForSources(AGENT_TOKEN, ids, AGENT_TOKEN);
  if (isScopesRpcErr(res) || res.data.edges.length < ROW_CAP) return res;
  if (ids.length === 1) {
    return err(
      "quota_exceeded",
      `An agent has ${ROW_CAP} or more links to other agents; the org chart can't read them all.`,
    );
  }
  const mid = Math.ceil(ids.length / 2);
  const [a, b] = await Promise.all([readAgentEdgesWhole(ids.slice(0, mid)), readAgentEdgesWhole(ids.slice(mid))]);
  if (isScopesRpcErr(a)) return a;
  if (isScopesRpcErr(b)) return b;
  return ok({ edges: [...a.data.edges, ...b.data.edges] });
}

async function readAll(agentIds: readonly string[]) {
  const ids = [...new Set(agentIds)].filter(Boolean);
  const edges: Array<{ id: string; sourceId: string; targetId: string; role: string | null }> = [];
  for (let i = 0; i < ids.length; i += ORG_CHART_READ_CHUNK) {
    const res = await readAgentEdgesWhole(ids.slice(i, i + ORG_CHART_READ_CHUNK));
    if (isScopesRpcErr(res)) return res;
    edges.push(...res.data.edges);
  }
  return ok(edges);
}

export const orgChartService = {
  /** Every manual link whose MANAGER is one of `agentIds`. */
  async listManualEdges(agentIds: readonly string[]): Promise<ScopesRpcResult<ManualOrgEdge[]>> {
    const res = await readAll(agentIds);
    if (isScopesRpcErr(res)) return res;
    return ok(
      res.data
        .filter((e) => e.role === ORG_CHART_ROLE && e.sourceId !== e.targetId)
        .map((e) => ({ edgeId: e.id, managerId: e.sourceId, reportId: e.targetId })),
    );
  },

  /**
   * Everyone directly under `agentIds`, by either kind of link — read fresh
   * from the server, so a loop check never trusts a half-loaded chart.
   */
  async listChildren(agentIds: readonly string[]): Promise<ScopesRpcResult<Array<{ parentId: string; childId: string }>>> {
    const res = await readAll(agentIds);
    if (isScopesRpcErr(res)) return res;
    return ok(
      res.data
        .filter((e) => (e.role === ORG_CHART_ROLE || e.role === MEMBER_ROLE) && e.sourceId !== e.targetId)
        .map((e) => ({ parentId: e.sourceId, childId: e.targetId })),
    );
  },

  /** The manual links that currently place `reportId` under someone. */
  async listManagersOf(reportId: string): Promise<ScopesRpcResult<ManualOrgEdge[]>> {
    const res = await associationsService.listForTargets(AGENT_TOKEN, [reportId]);
    if (isScopesRpcErr(res)) return res;
    return ok(
      res.data.edges
        .filter((e) => e.role === ORG_CHART_ROLE && e.sourceType === AGENT_TOKEN)
        .map((e) => ({ edgeId: e.id, managerId: e.sourceId, reportId: e.targetId })),
    );
  },

  async add(managerId: string, reportId: string): Promise<ScopesRpcResult<{ id: string }>> {
    return associationsService.add({
      sourceType: AGENT_TOKEN,
      sourceId: managerId,
      targetType: AGENT_TOKEN,
      targetId: reportId,
      role: ORG_CHART_ROLE,
    });
  },

  async remove(managerId: string, reportId: string): Promise<ScopesRpcResult<null>> {
    return associationsService.remove({
      sourceType: AGENT_TOKEN,
      sourceId: managerId,
      targetType: AGENT_TOKEN,
      targetId: reportId,
      role: ORG_CHART_ROLE,
    });
  },
};
