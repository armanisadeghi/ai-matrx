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
import type { KeywordResearchArtifact } from "@/types/python-generated/stream-events";
import { normalizeKeywordPhrase } from "@/features/marketing/seo/keyword/data";
import { isRecord } from "@/features/content-ir/kinds/legacy-bridge-utils";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

async function contentIrDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("content_ir");
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

/** Resolve a bounded research cluster by exact normalized phrase. */
export async function listKeywordsWithMarketByPhrases(
  phrases: string[],
  signal?: AbortSignal,
): Promise<KeywordWithMarket[]> {
  const normalized = Array.from(
    new Set(phrases.map(normalizeKeywordPhrase).filter(Boolean)),
  );
  if (normalized.length === 0) return [];
  const response = await (await seoDb())
    .from("keyword")
    .select("*, keyword_market(*)")
    .in("normalized_phrase", normalized)
    .is("deleted_at", null)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw response.error;
  return (response.data ?? []) as KeywordWithMarket[];
}

export interface SavedKeywordResearch {
  id: string;
  createdAt: string;
  artifact: KeywordResearchArtifact;
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function parseKeywordResearchArtifact(
  value: unknown,
): KeywordResearchArtifact | null {
  const record = jsonRecord(value);
  if (!record || typeof record.primary_keyword !== "string") return null;
  const keyword_lists = Array.isArray(record.keyword_lists)
    ? record.keyword_lists.flatMap((candidate) => {
        const list = jsonRecord(candidate);
        if (!list || typeof list.label !== "string") return [];
        const keywords = Array.isArray(list.keywords)
          ? list.keywords.filter(
              (keyword): keyword is string => typeof keyword === "string",
            )
          : [];
        return [{ label: list.label, keywords }];
      })
    : [];
  return { primary_keyword: record.primary_keyword, keyword_lists };
}

/**
 * Latest durable relationship-research artifact for this org + keyword.
 * Reads the canonical internal `content_ir.kind_instance`, not a paid compute
 * endpoint or creator-private command ledger, so every authorized org member
 * sees the same already-saved result.
 */
export async function getLatestSavedKeywordResearch(
  organizationId: string,
  phrase: string,
  signal?: AbortSignal,
): Promise<SavedKeywordResearch | null> {
  const db = await contentIrDb();
  const definition = await db
    .from("kind_definition")
    .select("id")
    .eq("kind", "keyword_relationship_research")
    .eq("is_active", true)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (definition.error) throw definition.error;
  if (!definition.data) return null;

  const exact = await db
    .from("kind_instance")
    .select("id, created_at, data")
    .eq("organization_id", organizationId)
    .eq("kind_definition_id", definition.data.id)
    .eq("data->>primary_keyword", phrase.trim())
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle();
  if (exact.error) throw exact.error;
  const exactArtifact = parseKeywordResearchArtifact(exact.data?.data);
  if (exact.data && exactArtifact) {
    return {
      id: exact.data.id,
      createdAt: exact.data.created_at,
      artifact: exactArtifact,
    };
  }

  // Case/whitespace-normalized fallback for keywords saved before the current
  // page phrase spelling was settled.
  const response = await db
    .from("kind_instance")
    .select("id, created_at, data")
    .eq("organization_id", organizationId)
    .eq("kind_definition_id", definition.data.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw response.error;
  const target = normalizeKeywordPhrase(phrase);
  for (const row of response.data ?? []) {
    const artifact = parseKeywordResearchArtifact(row.data);
    if (
      artifact &&
      normalizeKeywordPhrase(artifact.primary_keyword) === target
    ) {
      return { id: row.id, createdAt: row.created_at, artifact };
    }
  }
  return null;
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
