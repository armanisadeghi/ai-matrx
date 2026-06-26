/**
 * Map Surface-A app context (org + scopes) into `/rag/search` request fields.
 *
 * The Python SearchRequest accepts:
 *   - top-level `scope_ids`
 *   - `filters.organization_id` (admin override; still sent so the lab UI
 *     reflects the user's selection and admins can pivot orgs)
 *   - `filters.scope_ids` (same structural filter as top-level)
 *
 * Project and task are NOT part of the RAG search API — they affect agent
 * invocation via call-api scope injection but not chunk retrieval today.
 */
import type { RagSearchFilters } from "@/features/rag/api/search";

export interface ActiveContextForRagSearch {
  organizationId: string | null;
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
  const organization_id = ctx.organizationId ?? undefined;
  const scope_ids = ctx.scopeIds.length > 0 ? ctx.scopeIds : undefined;

  const filters: RagSearchFilters = {
    ...extraFilters,
    ...(organization_id ? { organization_id } : {}),
    ...(scope_ids ? { scope_ids } : {}),
  };

  const hasFilters = Object.keys(filters).length > 0;

  if (!scope_ids && !hasFilters) return {};

  return {
    ...(scope_ids ? { scope_ids } : {}),
    ...(hasFilters ? { filters } : {}),
  };
}
