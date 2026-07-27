// features/agents/browse/types.ts
//
// What is genuinely AGENT-specific about the canonical entity list.
//
// The query/filter/facet/count shapes now live in lib/entity-list/types.ts and
// the scope vocabulary in lib/list-scope/types.ts — this file is what remains
// when you take the feature out, and it is deliberately small: a row type
// derived from the RPC, an edit payload, and this surface's declared scopes.
//
// See ./FEATURE.md, and docs/handoffs/canonical-entity-list-extraction.md for
// the extraction in progress.

import type { Database } from "@/types/database.types";
import type { ListScopeKind } from "@/lib/list-scope/types";

/** One row, exactly as agx_list_scoped returns it. Never hand-mirrored. */
export type AgentBrowseRow =
  Database["public"]["Functions"]["agx_list_scoped"]["Returns"][number];

/**
 * Which of the fixed five scopes this surface supports. Agents has no industry
 * corpus yet, so it declares four — the tab bar renders exactly these, in this
 * order. Adding "industry" here is the whole UI change once agents grows an
 * industry grant table.
 */
export const AGENT_LIST_SCOPES: ListScopeKind[] = [
  "mine",
  "orgs",
  "shared",
  "public",
];

/** Fields the table can write back inline. */
export interface AgentRowEdit {
  name?: string;
  description?: string | null;
  category?: string | null;
  tags?: string[];
}

// ── Re-exports ──────────────────────────────────────────────────────────────
// Kept so this feature's modules import from one place while the extraction is
// in flight. These are the GENERIC types — do not add feature-specific fields
// to them here; extend lib/entity-list instead.
export type {
  ArchivedFilter,
  EntityFacets as BrowseFacets,
  EntityFilters as BrowseFilters,
  EntityFilterValue as BrowseFilterValue,
  EntityListQuery as BrowseQuery,
  EntityScopeCounts as BrowseScopeCounts,
} from "@/lib/entity-list/types";

export {
  countActiveFilters,
  DEFAULT_ENTITY_LIST_QUERY as DEFAULT_BROWSE_QUERY,
  EMPTY_FACETS,
  EMPTY_SCOPE_COUNTS,
  NONE_VALUE,
} from "@/lib/entity-list/types";

export type { ListScope as BrowseScope } from "@/lib/list-scope/types";
export {
  DEFAULT_LIST_SCOPE as DEFAULT_BROWSE_SCOPE,
  makeScope,
  scopeKey,
  scopeOrgId,
} from "@/lib/list-scope/types";
