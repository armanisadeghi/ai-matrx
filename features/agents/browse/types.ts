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
import type { WithFilledMandates } from "@/features/mandates/filled-by/service";

/**
 * One row, exactly as agx_list_scoped returns it (never hand-mirrored), plus
 * the mandates it fills for the viewer — attached per page by
 * `attachFilledMandates` (one `mnd_filled_by` call), never per row.
 */
export type AgentBrowseRow = WithFilledMandates<
  Database["public"]["Functions"]["agx_list_scoped"]["Returns"][number]
>;

/**
 * Which scopes this surface supports, in tab order — the same five for every
 * viewer. System is the platform's own built-in agents: every signed-in person
 * reads the PUBLISHED ones (card_visibility = 'public'), a platform admin also
 * reads the unpublished rest. `agx_list_scoped` decides which, never this list
 * (2026-09-27: System had been admin-only here AND in the database, and the
 * admin-seat change made `selectIsAdmin` false outside /administration, so
 * nobody saw the 500+ built-ins on /agents/all).
 */
export const AGENT_LIST_SCOPES: ListScopeKind[] = [
  "mine",
  "orgs",
  "shared",
  "public",
  "system",
];

/** Fields the table can write back inline. */
export interface AgentRowEdit {
  name?: string;
  description?: string | null;
  category?: string | null;
  tags?: string[];
}
