/**
 * Surface manifest — RAG Search Lab (`matrx-user/rag-search`).
 *
 * The retrieval workspace at `/rag/search` (`RagSearchExperience`). Four tabs
 * over ONE shared retrieval scope: Search (user-facing hybrid search with rich
 * result cards), Agent Simulation (the registered `knowledge_search` tool run
 * byte-for-byte, with raw request/response JSON), Agent Chat (the canonical
 * managed-agent stack launched on this surface with the knowledge tool family
 * armed), and Diagnostics (content inventory + per-query trace).
 *
 * Three kinds of value live here and must not be confused:
 *   - The RETRIEVAL SCOPE (data store, source kinds, the Surface-A working
 *     context's organization + scopes, admin ACL bypass) — what the search is
 *     allowed to see. An agent binding `knowledge_search.data_store_id` binds
 *     it from here so its searches match what the user is looking at.
 *   - The PIPELINE SETTINGS (rerank, multi-query, HyDE, entity-cluster
 *     expansion, limit) — how the search runs. These change recall/ordering,
 *     never permissions.
 *   - The RESULTS of the last search — evidence. Scores are pipeline-relative
 *     (fusion or rerank), never an absolute truth score.
 *
 * Runtime scope assembly lives in
 * `features/rag/agent-context/buildRagSearchContextData.ts` — the ONE pure
 * state→scope mapper, consumed by the Search tab's context menus and its
 * `SurfaceRuntimeProvider`, and (scope-only, no query/results) by the Agent
 * Chat tab's launch.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "query",
    label: "Query",
    sortOrder: 100,
    description: "What the user asked, and how well their words landed.",
  },
  {
    key: "retrieval_scope",
    label: "Retrieval scope",
    sortOrder: 200,
    description:
      "What the search is permitted and filtered to see: data store, source kinds, working-context organization and scopes, ACL bypass.",
  },
  {
    key: "pipeline_settings",
    label: "Pipeline settings",
    sortOrder: 300,
    description:
      "How retrieval runs: rerank, query expansion, entity clusters, result limit. Affects recall and ordering, never permissions.",
  },
  {
    key: "results",
    label: "Results",
    sortOrder: 400,
    description:
      "The passages the last search returned, their scores, and the run's retrieval telemetry.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Query ─────────────────────────────────────────────────────────────
  {
    name: "query",
    label: "Search query",
    description:
      "The user's current query in the RAG search box (trimmed). Empty before the user types anything, and on the Agent Chat / Diagnostics tabs, which carry the retrieval scope but no search box query.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    group: "query",
    sortOrder: 300,
  },
  {
    name: "executed_query",
    label: "Executed query",
    description:
      "The query string the last returned result set was actually run for, echoed by the server. Differs from `query` the moment the user edits the box without re-searching. Empty when no search has run.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    group: "query",
    sortOrder: 305,
  },
  {
    name: "query_term_coverage",
    label: "Query term coverage",
    description:
      "Per significant query term, how many returned results contain it verbatim (the page's 'Terms in results' readout). A zero means that word appeared in NO result — those hits matched on the other terms or on meaning. Empty when no search has run or the query has fewer than two terms.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 200,
    group: "query",
    sortOrder: 310,
  },

  // ── Retrieval scope ───────────────────────────────────────────────────
  {
    name: "data_store_id",
    label: "Data store ID",
    description:
      "UUID of the data store the user scoped retrieval to. Empty when the user is searching all accessible content (the default 'All accessible content' selection) — empty means EVERYTHING they can see, not nothing.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "retrieval_scope",
    sortOrder: 320,
  },
  {
    name: "data_store_name",
    label: "Data store name",
    description:
      "Human-readable name of the scoped data store. Empty when no specific store is selected, or briefly while the store list is still loading behind a deep link.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    group: "retrieval_scope",
    sortOrder: 325,
  },
  {
    name: "available_data_stores",
    label: "Available data stores",
    description:
      "The data stores the sidebar offers this user: one entry per store with id, name, kind, and member count. Empty array while loading or when the user has none. Bindable-only — an agent that needs a store list can call the knowledge tools instead.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    autoContext: false,
    group: "retrieval_scope",
    sortOrder: 330,
  },
  {
    name: "source_kinds",
    label: "Source-kind filter",
    description:
      "Array of source kinds the user limited results to, e.g. ['cld_file'], ['note'], or ['code_file']. Empty/absent when 'All' is selected.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "retrieval_scope",
    sortOrder: 335,
  },
  {
    name: "active_organization_id",
    label: "Working-context organization",
    description:
      "The organization the Surface-A working context restricts retrieval to. Empty means NO org filter — searching across every organization the user belongs to plus their personal content and the global library. Never read this as 'no access'.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "retrieval_scope",
    sortOrder: 340,
  },
  {
    name: "active_scope_ids",
    label: "Working-context scope IDs",
    description:
      "Scope ids from the working context that structurally filter results — only sources tagged to these scopes are eligible, combined with the semantic query. Empty array when the user has selected no scopes (no structural filter).",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "retrieval_scope",
    sortOrder: 345,
  },
  {
    name: "admin_bypass_acl",
    label: "Admin ACL bypass",
    description:
      "True when an admin toggled 'bypass ACL' to search across all indexed content regardless of permissions — results may include content the user could not normally see. False for normal users and normal admin sessions; the backend ignores the flag for non-admins.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "retrieval_scope",
    sortOrder: 350,
  },

  // ── Pipeline settings ─────────────────────────────────────────────────
  {
    name: "rerank",
    label: "Rerank enabled",
    description:
      "Whether the Cohere cross-encoder re-orders the fused candidates. Defaults to true. Even when on, a low-confidence window keeps the fusion order — read `rerank_status` for what actually happened.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "pipeline_settings",
    sortOrder: 360,
  },
  {
    name: "multi_query",
    label: "Multi-query count",
    description:
      "Number of paraphrase variants the pipeline expands the search into (1-5), each embedded and fused via RRF. 1 means no expansion.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    group: "pipeline_settings",
    sortOrder: 365,
  },
  {
    name: "use_hyde",
    label: "HyDE expansion",
    description:
      "Whether HyDE (hypothetical-document) query expansion is enabled on the retrieval pipeline. Defaults to false.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "pipeline_settings",
    sortOrder: 370,
  },
  {
    name: "expand_entity_clusters",
    label: "Entity-cluster expansion",
    description:
      "Whether knowledge-graph canonical concept expansion is on — also surfacing chunks about entities sharing a cluster with the query's matched entities. Defaults to false. Cross-spelling alias matches work regardless of this flag.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "pipeline_settings",
    sortOrder: 375,
  },
  {
    name: "result_limit",
    label: "Result limit",
    description:
      "How many hits the surface requests per search (25 on the Search tab, 10 for the Agent Simulation tool run). Empty on mounts that run no search.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    group: "pipeline_settings",
    sortOrder: 380,
  },

  // ── Results ───────────────────────────────────────────────────────────
  {
    name: "result_count",
    label: "Result count",
    description:
      "Number of hits returned by the last search. Zero is a real answer (nothing matched), distinct from empty (no search has run).",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "results",
    sortOrder: 400,
  },
  {
    name: "total_candidates",
    label: "Candidates considered",
    description:
      "How many candidate chunks the pipeline fused before limiting/reranking down to the returned hits. Empty when no search has run.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "results",
    sortOrder: 405,
  },
  {
    name: "search_results",
    label: "Search results",
    description:
      "The returned passages the user is reading, newest search only: per hit its rank, chunk_id, source_kind, source_id, file name, page number, score, and snippet (capped per hit). Empty when no search has run. Bindable-only — the readable joined text already rides in the baseline `content`, so this is not auto-added to context.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    autoContext: false,
    group: "results",
    sortOrder: 410,
  },
  {
    name: "result_scores",
    label: "Result scores",
    description:
      "The per-hit relevance scores in returned order. Pipeline-relative (rerank score when reranking applied, else the fused RRF score) — comparable within one result set, never across searches. Empty when no search has run.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "results",
    sortOrder: 415,
  },
  {
    name: "top_score",
    label: "Top score",
    description:
      "Score of the highest-ranked returned hit — the reference the result cards render their relative bars against. Empty when no search has run or nothing matched.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    group: "results",
    sortOrder: 420,
  },
  {
    name: "source_ids",
    label: "Matched source IDs",
    description:
      "Distinct source ids behind the returned hits (several chunks often come from one document). Empty when no search has run or nothing matched.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    group: "results",
    sortOrder: 425,
  },
  {
    name: "result_source_kinds",
    label: "Result source kinds",
    description:
      "Map of source kind → number of returned hits of that kind (cld_file, note, code_file, library_doc, …). Shows at a glance what the answer is being built from. Empty when no search has run.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 80,
    group: "results",
    sortOrder: 430,
  },
  {
    name: "latency_ms",
    label: "Search latency (ms)",
    description:
      "Server-reported wall time of the last search in milliseconds. Empty when no search has run.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "results",
    sortOrder: 435,
  },
  {
    name: "embedding_model",
    label: "Embedding model",
    description:
      "The embedding model the last search's vector lane used. Empty when no search has run.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    group: "results",
    sortOrder: 440,
  },
  {
    name: "reranker_model",
    label: "Reranker model",
    description:
      "The cross-encoder that re-ordered the candidates. Empty when reranking was off, unavailable, or no search has run — pair it with `rerank_status` before concluding anything.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    group: "results",
    sortOrder: 445,
  },
  {
    name: "rerank_status",
    label: "Rerank status",
    description:
      '"applied" (rerank ordering used), "low_confidence" (rerank ran but every candidate scored below the floor, so the fusion order was kept — no strong match for this query), "failed" (rerank errored, fusion order kept), or "off". Empty when no search has run or the backend predates the field.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 14,
    group: "results",
    sortOrder: 450,
  },
];

export const ragSearchManifest: SurfaceManifest = {
  surfaceName: "matrx-user/rag-search",
  readiness: "verified",
  label: "RAG Search",
  urlPattern: "/rag/search",
  intro: `<surface_intro>
You are on the RAG Search Lab: the user searches their own indexed content (PDFs, notes, code, library documents) through a hybrid retrieval pipeline, and can hand that same retrieval scope to you.
Read the values in three layers. RETRIEVAL SCOPE (data_store_id, source_kinds, active_organization_id, active_scope_ids, admin_bypass_acl) is what the search is allowed and filtered to see — when you call a knowledge tool, match this scope rather than inventing your own, and remember that an EMPTY data store or organization means "everything the user can see", never "nothing". PIPELINE SETTINGS (rerank, multi_query, use_hyde, expand_entity_clusters, result_limit) change recall and ordering only; they never widen permissions. RESULTS are evidence of the last search.
Scores are pipeline-relative — a rerank score or a fused RRF score — so they compare hits within one result set and mean nothing across searches. Never present a score as a confidence or a truth value. Check rerank_status before trusting the ordering: "low_confidence" means nothing matched the query strongly and the fusion order was kept, and "failed" means the reranker errored.
query_term_coverage tells you which of the user's words appeared in zero results; when a key term is missing, say so rather than answering around it. Zero results is a real, reportable answer — never fabricate passages, and cite the source and page of anything you do use.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

/** One returned passage as emitted in `search_results`. */
export interface RagSearchResultEntry {
  rank: number;
  chunk_id: string;
  source_kind: string;
  source_id: string;
  file_name?: string;
  page_number?: number;
  score: number;
  snippet: string;
}

/** One entry of the `query_term_coverage` readout. */
export interface RagQueryTermCoverageEntry {
  term: string;
  count: number;
}

/** One entry of `available_data_stores`. */
export interface RagDataStoreEntry {
  id: string;
  name: string;
  kind?: string | null;
  member_count?: number;
}

/**
 * Type-safe payload helper for the RAG Search surface. None of the values are
 * `alwaysAvailable` — the page can be in any state (no store selected, default
 * pipeline settings, no search run, a tab with no search box at all), so every
 * key is optional.
 */
export function createRagSearchScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  // Query
  query?: string;
  executed_query?: string;
  query_term_coverage?: RagQueryTermCoverageEntry[];
  // Retrieval scope
  data_store_id?: string;
  data_store_name?: string;
  available_data_stores?: RagDataStoreEntry[];
  source_kinds?: string[];
  active_organization_id?: string;
  active_scope_ids?: string[];
  admin_bypass_acl?: boolean;
  // Pipeline settings
  rerank?: boolean;
  multi_query?: number;
  use_hyde?: boolean;
  expand_entity_clusters?: boolean;
  result_limit?: number;
  // Results
  result_count?: number;
  total_candidates?: number;
  search_results?: RagSearchResultEntry[];
  result_scores?: number[];
  top_score?: number;
  source_ids?: string[];
  result_source_kinds?: Record<string, number>;
  latency_ms?: number;
  embedding_model?: string;
  reranker_model?: string;
  rerank_status?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
