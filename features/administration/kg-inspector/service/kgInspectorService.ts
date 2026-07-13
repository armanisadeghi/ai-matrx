/**
 * features/administration/kg-inspector/service/kgInspectorService.ts
 *
 * Direct-to-Supabase client for the read-only KG inspector surface.
 * `rag.fn_kg_inspector_entities` / `_entity_mentions` / `_top_edges` mirror
 * the retired `aidream/api/routers/kg_inspector.py` endpoints exactly —
 * admin-gated INSIDE each function (public.is_super_admin()), identity from
 * auth.uid() only. This is an admin-only forensic surface (Phase C.5) for
 * eyeballing NER entity / mention / edge data quality before the full
 * cytoscape viz (Phase G).
 */
import { createClient } from "@/utils/supabase/client";
import { ragDb } from "@/utils/supabase/ragDb";

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

export async function listKgEntities(
  params: ListEntitiesParams = {},
  opts: { signal?: AbortSignal } = {},
): Promise<KgEntitiesPage> {
  const supabase = createClient();
  let query = ragDb(supabase).rpc("fn_kg_inspector_entities", {
    p_organization_id: params.organizationId ?? undefined,
    p_kind: params.kind ?? undefined,
    p_q: params.q ?? undefined,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  });
  if (opts.signal) query = query.abortSignal(opts.signal);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as unknown as KgEntitiesPage;
}

export async function listKgEntityMentions(
  entityId: string,
  params: { limit?: number; offset?: number } = {},
  opts: { signal?: AbortSignal } = {},
): Promise<KgMentionsPage> {
  const supabase = createClient();
  let query = ragDb(supabase).rpc("fn_kg_inspector_entity_mentions", {
    p_entity_id: entityId,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  });
  if (opts.signal) query = query.abortSignal(opts.signal);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as unknown as KgMentionsPage;
}

export async function listKgTopEdges(
  params: { organizationId?: string | null; kind?: string | null; limit?: number } = {},
  opts: { signal?: AbortSignal } = {},
): Promise<KgEdgesTop> {
  const supabase = createClient();
  let query = ragDb(supabase).rpc("fn_kg_inspector_top_edges", {
    p_organization_id: params.organizationId ?? undefined,
    p_kind: params.kind ?? undefined,
    p_limit: params.limit ?? 50,
  });
  if (opts.signal) query = query.abortSignal(opts.signal);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as unknown as KgEdgesTop;
}
