// features/kg-graph/service/kgGraphService.ts
//
// Typed client for the aidream /kg router (aidream/api/routers/kg_graph.py,
// bare prefix `/kg`, public URL `/api/kg/*`).
//
// React → Python directly via the canonical `@/lib/python-client` wrapper
// (attaches the Supabase JWT as `Authorization: Bearer …` on every call — per
// CLAUDE.md, no Next.js middle hop). Mirrors `kg-suggestions/service`. These
// are USER-scoped: the backend filters the graph + mentions to what
// `ctx.user_id` can see. Keep these shapes in sync with the Pydantic models.

import { getJson } from "@/lib/python-client";
import type { GraphPayload, GraphQueryParams, MentionsPage } from "../types";

function buildQuery(
  params: Record<string, string | number | null | undefined>,
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && `${value}` !== "") {
      qs.set(key, `${value}`);
    }
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/**
 * GET /kg/graph — the org-wide graph (no scopeId) or one scope's neighborhood
 * (scopeId set). The backend caps node count and reports `truncated`.
 */
export async function fetchKgGraph(
  params: GraphQueryParams = {},
  opts: { signal?: AbortSignal } = {},
): Promise<GraphPayload> {
  const query = buildQuery({
    organization_id: params.organizationId,
    scope_id: params.scopeId,
    kind: params.kind,
    depth: params.depth,
    limit: params.limit,
  });
  const { data } = await getJson<GraphPayload>(`/kg/graph${query}`, {
    signal: opts.signal,
  });
  return data;
}

/**
 * GET /kg/graph/entity/{id}/mentions — drill-down for the side panel. Filtered
 * server-side to chunks the caller owns (never another user's private source).
 */
export async function fetchEntityMentions(
  entityId: string,
  params: { limit?: number; offset?: number } = {},
  opts: { signal?: AbortSignal } = {},
): Promise<MentionsPage> {
  const query = buildQuery({
    limit: params.limit,
    offset: params.offset,
  });
  const { data } = await getJson<MentionsPage>(
    `/kg/graph/entity/${encodeURIComponent(entityId)}/mentions${query}`,
    { signal: opts.signal },
  );
  return data;
}
