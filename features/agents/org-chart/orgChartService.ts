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
import { ok } from "@/features/scopes/service/rpcResult";
import { AGENT_TOKEN } from "@/features/agents/orchestras/constants";
import { ORG_CHART_READ_CHUNK, ORG_CHART_ROLE } from "./constants";
import type { ManualOrgEdge } from "./buildAgentOrgForest";

export const orgChartService = {
  /** Every manual link whose MANAGER is one of `agentIds`. */
  async listManualEdges(agentIds: readonly string[]): Promise<ScopesRpcResult<ManualOrgEdge[]>> {
    const ids = [...new Set(agentIds)].filter(Boolean);
    const out: ManualOrgEdge[] = [];
    for (let i = 0; i < ids.length; i += ORG_CHART_READ_CHUNK) {
      const res = await associationsService.listForSources(
        AGENT_TOKEN,
        ids.slice(i, i + ORG_CHART_READ_CHUNK),
        AGENT_TOKEN,
      );
      if (isScopesRpcErr(res)) return res;
      for (const e of res.data.edges) {
        if (e.role === ORG_CHART_ROLE && e.sourceId !== e.targetId) {
          out.push({ edgeId: e.id, managerId: e.sourceId, reportId: e.targetId });
        }
      }
    }
    return ok(out);
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
