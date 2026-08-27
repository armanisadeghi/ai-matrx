// features/agents/browse/types.ts
//
// What is genuinely AGENT-specific about the canonical entity list.
//
// The query/filter/facet/count shapes now live in lib/entity-list/types.ts and
// the scope vocabulary in lib/list-scope/types.ts — this file is what remains
// when you take the feature out, and it is deliberately small: a row type
// derived from the RPC, an edit payload, and this surface's declared scopes.
//
// See ./FEATURE.md, and lib/entity-list/FEATURE.md for the shell's contract.

import type { Database } from "@/types/database.types";
import type { ListScopeKind } from "@/lib/list-scope/types";

/** One row, exactly as agx_list_scoped returns it. Never hand-mirrored. */
export type AgentBrowseRow =
  Database["public"]["Functions"]["agx_list_scoped"]["Returns"][number];

/**
 * Which scopes this surface supports. Agents has no industry corpus yet, so it
 * declares four — the tab bar renders exactly these, in this order. Adding
 * "industry" here is the whole UI change once agents grows an industry grant
 * table.
 */
export const AGENT_LIST_SCOPES: ListScopeKind[] = [
  "mine",
  "orgs",
  "shared",
  "public",
];

/**
 * The same list plus the platform's own corpus. Rendered ONLY for a Matrx
 * admin — the page resolves which list to pass (`EntityListPage`'s `scopes`
 * prop), because a module constant cannot read auth state.
 *
 * The tab being hidden is a convenience, never the security: `agx_list_scoped`
 * re-checks `public.is_platform_admin()` and returns zero system rows to
 * everyone else.
 */
export const AGENT_LIST_SCOPES_ADMIN: ListScopeKind[] = [
  ...AGENT_LIST_SCOPES,
  "system",
];

/** Fields the table can write back inline. */
export interface AgentRowEdit {
  name?: string;
  description?: string | null;
  category?: string | null;
  tags?: string[];
}
