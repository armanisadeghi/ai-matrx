/**
 * Map Surface-A app context (scopes) into `/knowledge/search` request fields.
 *
 * The Python SearchRequest accepts:
 *   - top-level `scope_ids`
 *   - `filters.scope_ids` (same structural filter as top-level)
 *
 * The header's selected organization is NEVER sent: search answers from everything the person
 * can access across all their organizations (access-belongs-to-the-person). A caller that wants
 * an organization filter passes `organization_id` in `extraFilters` from an on-page control.
 *
 * Project and task are NOT part of the Knowledge search API — they affect agent
 * invocation via call-api scope injection but not chunk retrieval today.
 */
import type { RagSearchFilters } from "@/features/rag/api/search";

export interface ActiveContextForRagSearch {
  scopeIds: string[];
}

export interface RagSearchContextPayload {
  scope_ids?: string[];
  filters?: RagSearchFilters;
}

export function buildRagSearchContext(
  ctx: ActiveContextForRagSearch,
  extraFilters?: RagSearchFilters,
): RagSearchContextPayload {
  const scope_ids = ctx.scopeIds.length > 0 ? ctx.scopeIds : undefined;

  const filters: RagSearchFilters = {
    ...extraFilters,
    ...(scope_ids ? { scope_ids } : {}),
  };

  const hasFilters = Object.keys(filters).length > 0;

  if (!scope_ids && !hasFilters) return {};

  return {
    ...(scope_ids ? { scope_ids } : {}),
    ...(hasFilters ? { filters } : {}),
  };
}
