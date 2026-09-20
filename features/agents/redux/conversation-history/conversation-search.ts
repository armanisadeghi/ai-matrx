import { supabase } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import type { ConversationHistoryScopeState, SourceFacet } from "./types";

export type ConversationSearchRange = "7d" | "30d" | "90d" | "all";

type SearchScope = Pick<
  ConversationHistoryScopeState,
  | "agentIds"
  | "excludeSourceFeatures"
  | "includeSourceFeatures"
  | "includeSourceApps"
  | "includeEmptySource"
  | "includeOriginClasses"
  | "includeLanes"
>;

export interface ConversationSearchRequest {
  query: string;
  range: ConversationSearchRange;
  deep: boolean;
  limit: number;
  offset: number;
  scope: SearchScope;
  signal?: AbortSignal;
}

export interface ConversationSearchPage {
  items: ConversationListItem[];
  total: number;
}

type SearchArgs =
  Database["public"]["Functions"]["cx_search_conversations"]["Args"];

/** Small libraries search everything immediately; larger ones start cheaper. */
export function initialConversationSearchRange(
  conversationCount: number | null,
  pageSize: number,
): ConversationSearchRange {
  if (conversationCount === null) return "30d";
  if (conversationCount <= pageSize * 4) return "all";
  if (conversationCount <= pageSize * 20) return "90d";
  if (conversationCount <= pageSize * 100) return "30d";
  return "7d";
}

export function nextConversationSearchRange(
  range: ConversationSearchRange,
): ConversationSearchRange | null {
  if (range === "7d") return "30d";
  if (range === "30d") return "90d";
  if (range === "90d") return "all";
  return null;
}

export function conversationSearchRangeLabel(
  range: ConversationSearchRange,
): string {
  if (range === "7d") return "last 7 days";
  if (range === "30d") return "last 30 days";
  if (range === "90d") return "last 90 days";
  return "all time";
}

export function buildConversationSearchArgs(
  request: ConversationSearchRequest,
): SearchArgs {
  const { scope } = request;
  const args: SearchArgs = {
    p_search: request.query.trim(),
    p_since: request.range,
    p_deep: request.deep,
    p_limit: request.limit,
    p_offset: request.offset,
    p_exclude_source_features: scope.excludeSourceFeatures,
    p_include_source_features: scope.includeSourceFeatures,
    p_include_source_apps: scope.includeSourceApps,
    p_include_empty_source: scope.includeEmptySource,
  };

  if (scope.includeLanes !== null) args.p_lanes = scope.includeLanes;
  if (scope.agentIds.length > 0) args.p_agent_ids = scope.agentIds;
  if (scope.includeOriginClasses.length > 0) {
    args.p_origin_classes = scope.includeOriginClasses;
  }
  return args;
}

/** Exact facet-derived size when every active filter exists in the facet key. */
export function countConversationSearchCorpus(
  facets: SourceFacet[],
  scope: SearchScope,
): number | null {
  if (scope.agentIds.length > 0 || scope.includeOriginClasses.length > 0) {
    return null;
  }
  const hasSourceAllowList =
    scope.includeSourceFeatures.length > 0 ||
    scope.includeSourceApps.length > 0 ||
    scope.includeEmptySource;

  return facets.reduce((total, facet) => {
    if (
      scope.includeLanes !== null &&
      (!facet.lane || !scope.includeLanes.includes(facet.lane))
    ) {
      return total;
    }
    if (
      scope.excludeSourceFeatures.length > 0 &&
      (facet.sourceFeature === null ||
        scope.excludeSourceFeatures.includes(facet.sourceFeature))
    ) {
      return total;
    }
    if (
      hasSourceAllowList &&
      !scope.includeSourceFeatures.includes(facet.sourceFeature ?? "") &&
      !scope.includeSourceApps.includes(facet.sourceApp ?? "") &&
      !(scope.includeEmptySource && !facet.sourceFeature)
    ) {
      return total;
    }
    return total + facet.count;
  }, 0);
}

/**
 * Authoritative search. SQL ranks exact ids and labels first, then metadata.
 * Indexed message bodies are searched only on the explicit deep path (or for
 * identifier-shaped queries recognized by the shared SQL rule).
 */
export async function searchConversations(
  request: ConversationSearchRequest,
): Promise<ConversationSearchPage> {
  if (!request.query.trim() || request.scope.includeLanes?.length === 0) {
    return { items: [], total: 0 };
  }

  let rpc = supabase.rpc(
    "cx_search_conversations",
    buildConversationSearchArgs(request),
  );
  if (request.signal) rpc = rpc.abortSignal(request.signal);
  const { data, error } = await rpc;

  if (error) {
    if (request.signal?.aborted)
      throw new DOMException("Aborted", "AbortError");
    console.error("[conversation-search] server search failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error("We couldn't search saved chats. Please try again.");
  }

  const rows = data ?? [];
  return {
    total: rows.length > 0 ? Number(rows[0].total_count) : 0,
    items: rows.map((row) => ({
      conversationId: row.id,
      title: row.title,
      description: row.description,
      updatedAt: row.last_activity_at,
      createdAt: row.created_at,
      status: row.status,
      messageCount: row.message_count,
      isFavorite: row.is_favorite,
      excludeFromKg: row.exclude_from_kg,
      agentId: row.initial_agent_id,
      lastModelId: row.last_model_id,
      sourceApp: row.source_app ?? undefined,
      sourceFeature: row.source_feature ?? undefined,
      originClass: row.origin_class ?? undefined,
    })),
  };
}
