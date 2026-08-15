// features/agents/orchestras/service/orchestrasService.ts
//
// Service layer for Orchestras. This is a THIN orchestration over the canonical
// association chokepoint — it owns NO new mutation path:
//
//   • Writes → `associationsService` (assoc_add / assoc_remove / assoc_set_targets)
//   • List   → the `orchestra_list()` RPC (the one read the assoc_* family lacks)
//
// An Orchestra = an orchestrator agent + edges:
//   marker : (agent:X) --role 'orchestra'--> (agent:X)   [config + existence]
//   member : (agent:X) --role 'member'-----> (agent:Y)   [ordered by position]

//
// Like associationsService, every method returns a `ScopesRpcResult` and NEVER
// throws. See features/agents/docs/ORCHESTRAS.md.

"use client";

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { ok, err, mapPgError, mapPgErrorPair } from "@/features/scopes/service/rpcResult";
import { associationsService } from "@/features/scopes/service/associationsService";
import { isScopesRpcErr, type ScopesRpcResult } from "@/features/scopes/types";
import type { Json } from "@/types/database.types";
import {
  AGENT_TOKEN,
  MEMBER_ROLE,
  ORCHESTRA_MARKER_ROLE,
  isOrchestraMarkerRole,
} from "../constants";
import type {
  OrchestraConfig,
  OrchestraDetail,
  OrchestraListRow,
  OrchestraMember,
  OrchestraMemberMeta,
  OrchestraSummary,
} from "../types";

// ─── mappers ──────────────────────────────────────────────────────────

function asRecord(meta: Json | null | undefined): Record<string, unknown> {
  return meta && typeof meta === "object" && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : {};
}

function metaToConfig(meta: Json | null | undefined): OrchestraConfig {
  const m = asRecord(meta);
  const cfg: OrchestraConfig = {};
  if (typeof m.accent === "string") cfg.accent = m.accent as OrchestraConfig["accent"];
  if (typeof m.tagline === "string") cfg.tagline = m.tagline;
  if (m.orchestratorPos && typeof m.orchestratorPos === "object") {
    const p = m.orchestratorPos as Record<string, unknown>;
    if (typeof p.x === "number" && typeof p.y === "number") {
      cfg.orchestratorPos = { x: p.x, y: p.y };
    }
  }
  return cfg;
}

// Per-member metadata jsonb holds ONLY gap + saved position. The member's role
// title lives in the association's `label` column (see load()/addMember()).
function metaToMemberMeta(meta: Json | null | undefined): Pick<OrchestraMemberMeta, "gap" | "pos"> {
  const m = asRecord(meta);
  const out: Pick<OrchestraMemberMeta, "gap" | "pos"> = {};
  if (typeof m.gap === "string") out.gap = m.gap;
  if (m.pos && typeof m.pos === "object") {
    const p = m.pos as Record<string, unknown>;
    if (typeof p.x === "number" && typeof p.y === "number") out.pos = { x: p.x, y: p.y };
  }
  return out;
}

function rowToSummary(r: OrchestraListRow): OrchestraSummary {
  return {
    orchestratorId: r.orchestrator_id,
    name: r.name,
    description: r.description ?? null,
    label: r.set_label ?? null,
    config: metaToConfig(r.metadata),
    memberCount: r.member_count ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ─── service ──────────────────────────────────────────────────────────

export const orchestrasService = {
  /** Enumerate every Orchestra the caller can see (orchestrators + member counts). */
  async list(): Promise<ScopesRpcResult<OrchestraSummary[]>> {
    try {
      requireUserId();
      const { data, error } = await supabase.rpc("orchestra_list");
      if (error) return err(...mapPgErrorPair(error));
      const rows = (Array.isArray(data) ? data : []) as unknown as OrchestraListRow[];
      return ok(rows.map(rowToSummary));
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /** Load one Orchestra's marker config + ordered members in a single round-trip. */
  async load(orchestratorId: string): Promise<ScopesRpcResult<OrchestraDetail>> {
    const res = await associationsService.listForSources(
      AGENT_TOKEN,
      [orchestratorId],
      AGENT_TOKEN,
    );
    if (isScopesRpcErr(res)) return res;

    const edges = res.data.edges;
    const marker = edges.find(
      (e) => isOrchestraMarkerRole(e.role) && e.targetId === orchestratorId,
    );
    const members: OrchestraMember[] = edges
      .filter((e) => e.role === MEMBER_ROLE)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((e, i) => {
        const meta = metaToMemberMeta(e.metadata);
        return {
          edgeId: e.id,
          agentId: e.targetId,
          position: e.position ?? i,
          roleTitle: e.label ?? null, // role title = the association's label column
          gap: meta.gap ?? null,
          pos: meta.pos ?? null,
        };
      });

    return ok({
      orchestratorId,
      exists: Boolean(marker),
      label: marker?.label ?? null,
      config: metaToConfig(marker?.metadata),
      members,
    });
  },

  /** Create (or re-mark) an Orchestra by writing the orchestrator's `orchestra` self-edge. */
  async create(
    orchestratorId: string,
    opts?: { label?: string; config?: OrchestraConfig },
  ): Promise<ScopesRpcResult<{ id: string }>> {
    return associationsService.add({
      sourceType: AGENT_TOKEN,
      sourceId: orchestratorId,
      targetType: AGENT_TOKEN,
      targetId: orchestratorId,
      role: ORCHESTRA_MARKER_ROLE,
      label: opts?.label,
      metadata: opts?.config ?? {},
    });
  },

  /** Persist Orchestra-level config (accent / tagline / orchestrator position). */
  async saveConfig(
    orchestratorId: string,
    args: { label?: string; config: OrchestraConfig },
  ): Promise<ScopesRpcResult<{ id: string }>> {
    return associationsService.add({
      sourceType: AGENT_TOKEN,
      sourceId: orchestratorId,
      targetType: AGENT_TOKEN,
      targetId: orchestratorId,
      role: ORCHESTRA_MARKER_ROLE,
      label: args.label,
      metadata: args.config ?? {},
    });
  },

  /** Add (or upsert) a member with its position + authored role/gap metadata. */
  async addMember(
    orchestratorId: string,
    memberId: string,
    args?: { position?: number; meta?: OrchestraMemberMeta },
  ): Promise<ScopesRpcResult<{ id: string }>> {
    const meta = args?.meta ?? {};
    return associationsService.add({
      sourceType: AGENT_TOKEN,
      sourceId: orchestratorId,
      targetType: AGENT_TOKEN,
      targetId: memberId,
      role: MEMBER_ROLE,
      // role title → the canonical `label` column; only gap + saved position ride metadata
      label: meta.roleTitle,
      position: args?.position,
      metadata: { gap: meta.gap, pos: meta.pos } as Json,
    });
  },

  /** Remove one member (role-scoped: never touches the marker self-edge). */
  async removeMember(
    orchestratorId: string,
    memberId: string,
  ): Promise<ScopesRpcResult<null>> {
    return associationsService.remove({
      sourceType: AGENT_TOKEN,
      sourceId: orchestratorId,
      targetType: AGENT_TOKEN,
      targetId: memberId,
      role: MEMBER_ROLE,
    });
  },

  /** Delete an Orchestra: clear all members (role-scoped) then drop the marker. */
  async deleteOrchestra(orchestratorId: string): Promise<ScopesRpcResult<null>> {
    const cleared = await associationsService.setTargets({
      sourceType: AGENT_TOKEN,
      sourceId: orchestratorId,
      targetType: AGENT_TOKEN,
      targetIds: [],
      role: MEMBER_ROLE,
    });
    if (isScopesRpcErr(cleared)) return cleared;
    return associationsService.remove({
      sourceType: AGENT_TOKEN,
      sourceId: orchestratorId,
      targetType: AGENT_TOKEN,
      targetId: orchestratorId,
      role: ORCHESTRA_MARKER_ROLE,
    });
  },
};
