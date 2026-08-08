// features/kg-graph/types.ts
//
// Wire shapes for the aidream /kg router (Phase G). Every response type is
// DERIVED from the OpenAPI-generated contract (`types/python-generated/
// api-types.ts`), never hand-mirrored — a backend rename lights up every
// drifted callsite as a compile error after `pnpm sync-types`. The backend is
// USER-scoped (not admin): the graph payload only contains entities the caller
// can see, and mention drill-down only returns chunks the caller owns.
//
// cytoscape wants edges keyed `source` / `target` — the backend already emits
// those names, so these flow straight into <CytoscapeComponent> elements.

import type { components } from "@/types/python-generated/api-types";

/** One entity node. `mention_count` / `source_count` / `confidence_avg` come
 *  from NER mentions (0 until the NER backfill runs on a user's org). */
export type GraphNode = components["schemas"]["GraphNode"];

/** One typed edge between two nodes already present in `nodes`
 *  (`source` / `target` are the cytoscape edge endpoint keys). */
export type GraphEdge = components["schemas"]["GraphEdge"];

/** GET /kg/graph response. `truncated` ⇒ more visible nodes existed than the cap. */
export type GraphPayload = components["schemas"]["GraphPayload"];

/** Params for GET /kg/graph. Org-wide when `scopeId` is absent; otherwise the
 *  neighborhood of one scope (depth hops along edges, hard-capped at 3).
 *  FE-only query-param shape (camelCase) — no generated schema corresponds. */
export interface GraphQueryParams {
  organizationId?: string | null;
  scopeId?: string | null;
  kind?: string | null;
  depth?: number;
  limit?: number;
}

/** One mention of an entity in a source the caller can access. */
export type MentionRow =
  components["schemas"]["aidream__api__routers__kg_inspector__MentionRow"];

/** GET /kg/graph/entity/{id}/mentions response. */
export type MentionsPage =
  components["schemas"]["aidream__api__routers__kg_inspector__MentionsPage"];

export type KgGraphMode = "org" | "scope";
