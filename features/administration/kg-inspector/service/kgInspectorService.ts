/**
 * features/administration/kg-inspector/service/kgInspectorService.ts
 *
 * Typed client for the read-only KG inspector backend
 * (`aidream/api/routers/kg_inspector.py`, bare prefix `/kg-inspector`).
 *
 * React → Python directly (per CLAUDE.md — no Next.js middle hop). The
 * response shapes here mirror the Pydantic models the Python team declared;
 * keep them in sync with that router. This is an admin-only forensic surface
 * (Phase C.5) for eyeballing NER entity / mention / edge data quality before
 * the full cytoscape viz (Phase G).
 */
import { getJson } from "@/lib/python-client";

export interface KgEntityRow {
  id: string;
  kind: string;
  canonical_name: string;
  organization_id: string | null;
  mention_count: number;
  source_count: number;
  confidence_avg: number | null;
  created_at: string;
}

export interface KgEntitiesPage {
  items: KgEntityRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface KgMentionRow {
  chunk_id: string;
  source_kind: string | null;
  source_id: string | null;
  snippet: string;
  span_start: number | null;
  span_end: number | null;
  confidence: number | null;
}

export interface KgMentionsPage {
  items: KgMentionRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface KgEdgeRow {
  id: string;
  kind: string;
  src_id: string;
  src_name: string;
  src_kind: string;
  dst_id: string;
  dst_name: string;
  dst_kind: string;
  weight: number | null;
}

export interface KgEdgesTop {
  items: KgEdgeRow[];
}

export interface ListEntitiesParams {
  organizationId?: string | null;
  kind?: string | null;
  q?: string | null;
  limit?: number;
  offset?: number;
}

function buildQuery(params: Record<string, string | number | null | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && `${value}` !== "") {
      qs.set(key, `${value}`);
    }
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export async function listKgEntities(
  params: ListEntitiesParams = {},
  opts: { signal?: AbortSignal } = {},
): Promise<KgEntitiesPage> {
  const query = buildQuery({
    organization_id: params.organizationId,
    kind: params.kind,
    q: params.q,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  });
  const { data } = await getJson<KgEntitiesPage>(`/kg-inspector/entities${query}`, {
    signal: opts.signal,
  });
  return data;
}

export async function listKgEntityMentions(
  entityId: string,
  params: { limit?: number; offset?: number } = {},
  opts: { signal?: AbortSignal } = {},
): Promise<KgMentionsPage> {
  const query = buildQuery({
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  });
  const { data } = await getJson<KgMentionsPage>(
    `/kg-inspector/entities/${encodeURIComponent(entityId)}/mentions${query}`,
    { signal: opts.signal },
  );
  return data;
}

export async function listKgTopEdges(
  params: { organizationId?: string | null; kind?: string | null; limit?: number } = {},
  opts: { signal?: AbortSignal } = {},
): Promise<KgEdgesTop> {
  const query = buildQuery({
    organization_id: params.organizationId,
    kind: params.kind,
    limit: params.limit ?? 50,
  });
  const { data } = await getJson<KgEdgesTop>(`/kg-inspector/edges/top${query}`, {
    signal: opts.signal,
  });
  return data;
}
