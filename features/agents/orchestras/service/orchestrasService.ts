// features/agents/orchestras/service/orchestrasService.ts
//
// Service layer for Orchestras. This is a THIN orchestration over the canonical
// association chokepoint — it owns NO new mutation path:
//
//   • Writes → `associationsService` (assoc_add / assoc_remove / assoc_set_targets)
//   • List   → the `orchestra_list()` RPC (the one read the assoc_* family lacks)
//
// An Orchestra = an conductor agent + edges:
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
  isOrchestraDepthBudget,
  isOrchestraMode,
  isOrchestraResultMode,
  DEFAULT_ORCHESTRA_RESULT_MODE,
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
  if (isOrchestraMode(m.mode)) cfg.mode = m.mode;
  // Wire key is snake_case (the server reads metadata.depth_budget); tolerate
  // jsonb float widening, ignore anything the server would reject.
  const rawBudget =
    typeof m.depth_budget === "number" && Number.isInteger(m.depth_budget)
      ? m.depth_budget
      : undefined;
  if (isOrchestraDepthBudget(rawBudget)) cfg.depthBudget = rawBudget;
  if (m.conductorPos && typeof m.conductorPos === "object") {
    const p = m.conductorPos as Record<string, unknown>;
    if (typeof p.x === "number" && typeof p.y === "number") {
      cfg.conductorPos = { x: p.x, y: p.y };
    }
  }
  return cfg;
}

// The ONE OrchestraConfig -> marker-metadata serializer. camelCase fields ride
// verbatim; server-read keys keep their wire names (`depth_budget` — the
// aidream runtime strict-parses it, so an out-of-range value is never written).
function configToMeta(cfg: OrchestraConfig): Json {
  const { depthBudget, ...rest } = cfg;
  return {
    ...rest,
    ...(isOrchestraDepthBudget(depthBudget) ? { depth_budget: depthBudget } : {}),
  } as Json;
}

// Per-member metadata jsonb holds ONLY gap + saved position. The member's role
// title lives in the association's `label` column (see load()/addMember()).
function metaToMemberMeta(
  meta: Json | null | undefined,
): Pick<OrchestraMemberMeta, "gap" | "pos" | "required" | "resultMode"> {
  const m = asRecord(meta);
  const out: Pick<OrchestraMemberMeta, "gap" | "pos" | "required" | "resultMode"> = {};
  if (typeof m.gap === "string") out.gap = m.gap;
  // Strict bool — mirrors the server's strict parse (a string "true" is not a declaration).
  if (m.required === true) out.required = true;
  // Wire key is snake_case (the server reads metadata.result_mode). Strict —
  // the server REFUSES to run an unrecognized value, so the builder must never
  // present one as if it were saved.
  if (isOrchestraResultMode(m.result_mode)) out.resultMode = m.result_mode;
  if (m.pos && typeof m.pos === "object") {
    const p = m.pos as Record<string, unknown>;
    if (typeof p.x === "number" && typeof p.y === "number") out.pos = { x: p.x, y: p.y };
  }
  return out;
}

function rowToSummary(r: OrchestraListRow): OrchestraSummary {
  return {
    conductorId: r.conductor_id,
    name: r.name,
    description: r.description ?? null,
    label: r.label ?? null,
    config: metaToConfig(r.metadata),
    memberCount: r.member_count ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ─── service ──────────────────────────────────────────────────────────

export const orchestrasService = {
  /** Enumerate every Orchestra the caller can see (conductors + member counts). */
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
  async load(conductorId: string): Promise<ScopesRpcResult<OrchestraDetail>> {
    const res = await associationsService.listForSources(
      AGENT_TOKEN,
      [conductorId],
      AGENT_TOKEN,
    );
    if (isScopesRpcErr(res)) return res;

    const edges = res.data.edges;
    const marker = edges.find(
      (e) => isOrchestraMarkerRole(e.role) && e.targetId === conductorId,
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
          required: meta.required === true,
          resultMode: meta.resultMode ?? DEFAULT_ORCHESTRA_RESULT_MODE,
        };
      });

    return ok({
      conductorId,
      exists: Boolean(marker),
      label: marker?.label ?? null,
      config: metaToConfig(marker?.metadata),
      members,
    });
  },

  /** Create (or re-mark) an Orchestra by writing the conductor's `orchestra` self-edge. */
  async create(
    conductorId: string,
    opts?: { label?: string; config?: OrchestraConfig },
  ): Promise<ScopesRpcResult<{ id: string }>> {
    return associationsService.add({
      sourceType: AGENT_TOKEN,
      sourceId: conductorId,
      targetType: AGENT_TOKEN,
      targetId: conductorId,
      role: ORCHESTRA_MARKER_ROLE,
      label: opts?.label,
      metadata: configToMeta(opts?.config ?? {}),
    });
  },

  /** Persist Orchestra-level config (accent / tagline / conductor position). */
  async saveConfig(
    conductorId: string,
    args: { label?: string; config: OrchestraConfig },
  ): Promise<ScopesRpcResult<{ id: string }>> {
    return associationsService.add({
      sourceType: AGENT_TOKEN,
      sourceId: conductorId,
      targetType: AGENT_TOKEN,
      targetId: conductorId,
      role: ORCHESTRA_MARKER_ROLE,
      label: args.label,
      metadata: configToMeta(args.config ?? {}),
    });
  },

  /** Add (or upsert) a member with its position + authored role/gap metadata. */
  async addMember(
    conductorId: string,
    memberId: string,
    args?: { position?: number; meta?: OrchestraMemberMeta },
  ): Promise<ScopesRpcResult<{ id: string }>> {
    const meta = args?.meta ?? {};
    return associationsService.add({
      sourceType: AGENT_TOKEN,
      sourceId: conductorId,
      targetType: AGENT_TOKEN,
      targetId: memberId,
      role: MEMBER_ROLE,
      // role title → the canonical `label` column; only gap + saved position ride metadata
      label: meta.roleTitle,
      position: args?.position,
      // `required` is written ONLY as a JSON true — the server (and this
      // service's reader) strict-parse it, so no false/undefined noise on edges.
      // `result_mode` (wire key, snake_case) is written only when it is NOT the
      // default: the server treats an absent key as "inline", so an all-default
      // roster leaves edges exactly as they were before D-40.
      metadata: {
        gap: meta.gap,
        pos: meta.pos,
        ...(meta.required === true ? { required: true } : {}),
        ...(isOrchestraResultMode(meta.resultMode) &&
        meta.resultMode !== DEFAULT_ORCHESTRA_RESULT_MODE
          ? { result_mode: meta.resultMode }
          : {}),
      } as Json,
    });
  },

  /** Remove one member (role-scoped: never touches the marker self-edge). */
  async removeMember(
    conductorId: string,
    memberId: string,
  ): Promise<ScopesRpcResult<null>> {
    return associationsService.remove({
      sourceType: AGENT_TOKEN,
      sourceId: conductorId,
      targetType: AGENT_TOKEN,
      targetId: memberId,
      role: MEMBER_ROLE,
    });
  },

  /** Delete an Orchestra: clear all members (role-scoped) then drop the marker. */
  async deleteOrchestra(conductorId: string): Promise<ScopesRpcResult<null>> {
    const cleared = await associationsService.setTargets({
      sourceType: AGENT_TOKEN,
      sourceId: conductorId,
      targetType: AGENT_TOKEN,
      targetIds: [],
      role: MEMBER_ROLE,
    });
    if (isScopesRpcErr(cleared)) return cleared;
    return associationsService.remove({
      sourceType: AGENT_TOKEN,
      sourceId: conductorId,
      targetType: AGENT_TOKEN,
      targetId: conductorId,
      role: ORCHESTRA_MARKER_ROLE,
    });
  },
};
