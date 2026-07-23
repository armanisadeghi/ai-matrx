/**
 * Direct Supabase reads for the keyword plane (world-readable universal
 * tables: seo.keyword + seo.keyword_market + seo.keyword_edge). Reads go
 * DIRECT to Supabase — never through the Python server (CLAUDE.md data-flow
 * rule); the Python endpoints are only for the compute paths (agent research,
 * provider volume fetches).
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";

import type {
  KeywordEdgeRow,
  KeywordEdgeView,
  KeywordWithMarket,
} from "../types";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

function cleanSearch(value: string): string {
  return value.trim().replace(/[(),"'\\%]/g, " ").trim();
}

/**
 * List keywords with their market rows, newest first, optionally filtered by
 * a phrase substring. Sorting by volume happens client-side (the market rows
 * are an embedded resource).
 */
export async function listKeywordsWithMarket(options: {
  search?: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<KeywordWithMarket[]> {
  const { search, limit = 200, signal } = options;
  let query = (await seoDb())
    .from("keyword")
    .select("*, keyword_market(*)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  const cleaned = search ? cleanSearch(search) : "";
  if (cleaned) {
    query = query.ilike("normalized_phrase", `%${cleaned.toLowerCase()}%`);
  }
  const response = await query.abortSignal(
    signal ?? new AbortController().signal,
  );
  if (response.error) throw response.error;
  return (response.data ?? []) as KeywordWithMarket[];
}

/** All edges touching a keyword, annotated with the partner phrase. */
export async function listKeywordEdges(
  keywordId: string,
  signal?: AbortSignal,
): Promise<KeywordEdgeView[]> {
  const db = await seoDb();
  const edgesResponse = await db
    .from("keyword_edge")
    .select("*")
    .or(`source_keyword_id.eq.${keywordId},target_keyword_id.eq.${keywordId}`)
    .is("deleted_at", null)
    .abortSignal(signal ?? new AbortController().signal);
  if (edgesResponse.error) throw edgesResponse.error;
  const edges = (edgesResponse.data ?? []) as KeywordEdgeRow[];
  if (edges.length === 0) return [];

  const partnerIds = Array.from(
    new Set(
      edges.map((edge) =>
        edge.source_keyword_id === keywordId
          ? edge.target_keyword_id
          : edge.source_keyword_id,
      ),
    ),
  );
  const partnersResponse = await db
    .from("keyword")
    .select("id, phrase")
    .in("id", partnerIds);
  if (partnersResponse.error) throw partnersResponse.error;
  const phraseById = new Map(
    (partnersResponse.data ?? []).map((row) => [row.id, row.phrase]),
  );

  return edges.map((edge) => {
    const outgoing = edge.source_keyword_id === keywordId;
    const partnerId = outgoing ? edge.target_keyword_id : edge.source_keyword_id;
    return {
      id: edge.id,
      edge_type: edge.edge_type,
      status: edge.status,
      origin: edge.origin,
      confidence: edge.confidence,
      direction: outgoing ? "outgoing" : "incoming",
      partner_keyword_id: partnerId,
      partner_phrase: phraseById.get(partnerId) ?? "(unknown keyword)",
    } satisfies KeywordEdgeView;
  });
}
