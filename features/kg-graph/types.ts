// features/kg-graph/types.ts
//
// Wire shapes for the aidream /kg router (Phase G), kept in lock-step with the
// Pydantic models in `aidream/api/routers/kg_graph.py`. The backend is
// USER-scoped (not admin): the graph payload only contains entities the caller
// can see, and mention drill-down only returns chunks the caller owns.
//
// cytoscape wants edges keyed `source` / `target` — the backend already emits
// those names, so these flow straight into <CytoscapeComponent> elements.

/** One entity node. `mention_count` / `source_count` / `confidence_avg` come
 *  from NER mentions (0 until the NER backfill runs on a user's org). */
export interface GraphNode {
  id: string;
  kind: string;
  name: string;
  mention_count: number;
  source_count: number;
  confidence_avg: number | null;
}

/** One typed edge between two nodes already present in `nodes`. */
export interface GraphEdge {
  id: string;
  kind: string;
  source: string; // src node id (cytoscape edge endpoint key)
  target: string; // dst node id (cytoscape edge endpoint key)
  weight: number | null;
}

/** GET /kg/graph response. `truncated` ⇒ more visible nodes existed than the cap. */
export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
}

/** Params for GET /kg/graph. Org-wide when `scopeId` is absent; otherwise the
 *  neighborhood of one scope (depth hops along edges, hard-capped at 3). */
export interface GraphQueryParams {
  organizationId?: string | null;
  scopeId?: string | null;
  kind?: string | null;
  depth?: number;
  limit?: number;
}

/** One mention of an entity in a source the caller can access. Mirrors the
 *  MentionRow Pydantic model. */
export interface MentionRow {
  chunk_id: string;
  source_kind: string | null;
  source_id: string | null;
  snippet: string;
  span_start: number | null;
  span_end: number | null;
  confidence: number | null;
}

/** GET /kg/graph/entity/{id}/mentions response. */
export interface MentionsPage {
  items: MentionRow[];
  total: number;
  limit: number;
  offset: number;
}

export type KgGraphMode = "org" | "scope";
