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
 * The write half (`writeTargets`, below) covers the other direction: an agent
 * can STAGE the next retrieval query, its scope, and its pipeline knobs — but
 * never run the search, and never touch a result. See the docblock above
 * `writeTargets` for the split and the per-mount reasoning.
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
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  FILTERABLE_SOURCE_KIND_ENUM_TEXT,
  MULTI_QUERY_MAX,
  MULTI_QUERY_MIN,
} from "@/features/rag/search-controls";
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
    description: `Number of paraphrase variants the pipeline expands the search into (${MULTI_QUERY_MIN}-${MULTI_QUERY_MAX}), each embedded and fused via RRF. ${MULTI_QUERY_MIN} means no expansion.`,
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
    description: `How many hits the surface requests per search. On the Search tab this is the sidebar's Limit control (${RESULT_LIMIT_MIN}-${RESULT_LIMIT_MAX}, default ${RESULT_LIMIT_DEFAULT}); the Agent Simulation tool run is pinned to 10 because it reproduces the registered knowledge_search tool. Empty on mounts that run no search.`,
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

/**
 * Write targets — the RETRIEVAL QUERY and the knobs that shape it, staged for
 * the user to run.
 *
 * What earns a target here is the PLANNING half of this surface: what to ask,
 * where to look, and how hard to look. All four targets have read twins, so
 * the evidence loop closes — the agent reads `query_term_coverage` showing a
 * key word landed in zero results, or `rerank_status: "low_confidence"`
 * meaning nothing matched strongly, and writes back a better query or a
 * broader pipeline. That remediation loop is the whole reason this surface
 * earns write targets rather than staying read-only.
 *
 * RUNNING the search is deliberately NOT agent-drivable, for two independent
 * reasons. First, cost: one click spends an embedding call per paraphrase
 * variant, a Cohere rerank pass, and (with HyDE on) an LLM generation — the
 * `scraper` and `image-generate` precedents both leave the spending button to
 * the human, and nothing here argues for differing. Second, redundancy: this
 * surface already arms the `knowledge_search` tool family on every agent bound
 * to it, so an agent that wants retrieval results runs its OWN search and
 * reads them directly. A "run the search" target would spend the user's money
 * to obtain something the agent can already get for free.
 *
 * NOTHING IN THE `results` GROUP IS WRITABLE, and this is not an oversight.
 * `search_results`, `result_scores`, `result_count`, `total_candidates`,
 * `top_score`, `executed_query`, and `query_term_coverage` are RETRIEVED
 * EVIDENCE — the record of what the corpus actually returned. An agent that
 * could overwrite them would be fabricating retrieval output that the user's
 * own reading, and every downstream step, would treat as real. Same for the
 * telemetry (`latency_ms`, `embedding_model`, `reranker_model`,
 * `rerank_status`): they describe a run that happened.
 *
 * ALSO DELIBERATELY ABSENT:
 *  - `admin_bypass_acl` — an ACL escape hatch. Permissions are never
 *    agent-writable, full stop. The backend ignores the flag for non-admins,
 *    but "the server would refuse it anyway" is not a reason to offer it.
 *  - `active_organization_id` / `active_scope_ids` — ownership and tenancy.
 *    They also belong to the Surface-A working context, not to this page; this
 *    surface only REPORTS them.
 *  - `result_limit` — the Search tab renders NO control for it (it is the
 *    `SEARCH_TAB_RESULT_LIMIT` constant). A staged value the user cannot see
 *    or correct is not a draft, so it gets no target.
 *
 * WHY THREE SCALARS PLUS ONE PATCH OBJECT:
 *
 *  - `search_query`, `retrieval_data_store`, and `retrieval_source_kinds` stay
 *    SEPARATE because they are genuinely independent decisions a user would
 *    accept or decline one at a time ("yes, search that phrasing — no, don't
 *    restrict me to notes"), and — unlike the scraper's mode/target pair —
 *    none of them gates which input the form renders, so there is no race
 *    between them. Each keeps a clean 1:1 `updatesValue` read twin, which a
 *    bundled object could not have.
 *  - `retrieval_tuning` bundles rerank / HyDE / multi-query / entity-clusters
 *    because they are ONE decision wearing four checkboxes: "how hard should
 *    this search try". A recall-remediation recommendation typically moves two
 *    or three of them together, and four consecutive ask dialogs for one
 *    coherent suggestion is exactly the micro-target trap. One object means
 *    one atomic accept/decline. It has no single `updatesValue`, so its
 *    contract prose names the read twin for each key instead.
 *
 * MOUNTS: the Search tab (`SearchTab` in `RagSearchExperience`) is the ONLY
 * mount that registers a `SurfaceRuntimeProvider` for this surface, so it is
 * the only mount that offers these targets — correctly, because it is the only
 * tab with a search box at all. The Agent Simulation and Diagnostics tabs have
 * their own local query inputs and share this same `scope` object, but mount
 * no runtime; the Agent Chat tab passes a scope-only payload at launch and has
 * no query of its own. Giving those tabs targets would mean mounting the
 * runtime there first (read side included) — a separate task. Deepest-wins
 * resolution means adding one later shadows nothing declared here.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "search_query",
    label: "Search query",
    description:
      "Stages the text of the RAG search box — what the next search will ask. Value: a non-empty string, which REPLACES the full contents of the box (there is no append mode; to extend the user's wording, read the current text from `query` and send the whole new string). Whitespace-only is refused. This only STAGES the query: the user still presses Search, and running the search is never an agent action. Use this to repair a query the evidence says failed — read `query_term_coverage` for words that landed in zero results, and `rerank_status` (\"low_confidence\" means nothing matched strongly) — rather than to ask the same question twice.",
    valueType: "string",
    updatesValue: "query",
    mode: "draft",
    applyPolicy: "ask",
    group: "query",
    sortOrder: 100,
  },
  {
    name: "retrieval_data_store",
    label: "Data store scope",
    description:
      "Stages WHICH data store the next search is scoped to — the sidebar's store selection. Value: the UUID of a store, which MUST be one of the ids listed in `available_data_stores` (that is exactly the set the user's sidebar offers; an id that is not in it is refused rather than staged into a selection that would render as nothing). Send null to select \"All accessible content\", which searches EVERYTHING the user can see — never send null meaning \"no access\". Replaces the current selection; only one store can be scoped at a time. Read back from `data_store_id` / `data_store_name`. This narrows or widens the haystack only — it never grants access to content the user could not already read; the backend enforces permissions regardless. Staged only: the user still presses Search.",
    valueType: "string",
    updatesValue: "data_store_id",
    mode: "draft",
    applyPolicy: "ask",
    group: "retrieval_scope",
    sortOrder: 110,
  },
  {
    name: "retrieval_source_kinds",
    label: "Source-kind filter",
    description:
      `Stages the source-kind filter — which KIND of indexed content the next search is limited to. Value: an array that REPLACES the full filter (this is not an append; read the current value from \`source_kinds\` and send the complete new set). The array may hold AT MOST ONE kind, because the toggle that renders this filter is single-select — a two-kind array is refused rather than staged into a control that could only show one of them. Allowed kinds: ${FILTERABLE_SOURCE_KIND_ENUM_TEXT}. Send an empty array to clear the filter back to "All", which searches every kind. Note that "processed_document" and "library_doc" content is reached through the data store selector (retrieval_data_store), not through this filter, so neither is accepted here. Staged only: the user still presses Search.`,
    valueType: "array",
    updatesValue: "source_kinds",
    mode: "draft",
    applyPolicy: "ask",
    group: "retrieval_scope",
    sortOrder: 120,
  },
  {
    name: "retrieval_tuning",
    label: "Pipeline tuning",
    description:
      `Stages HOW HARD the next search tries — the sidebar's pipeline knobs, as one coherent recall strategy. Value is a partial patch object: { rerank?: boolean, use_hyde?: boolean, multi_query?: integer ${MULTI_QUERY_MIN}-${MULTI_QUERY_MAX}, expand_entity_clusters?: boolean } — omitted keys keep their current value, and at least one key must be present. Read each key back from its twin: \`rerank\`, \`use_hyde\`, \`multi_query\`, \`expand_entity_clusters\`. What they do: \`rerank\` re-orders fused candidates with a cross-encoder (on by default; turn it off only to inspect raw fusion order); \`use_hyde\` expands the query into a hypothetical answer document before embedding; \`multi_query\` embeds N paraphrase variants and fuses them with RRF (${MULTI_QUERY_MIN} means no expansion, ${MULTI_QUERY_MAX} is the maximum the input accepts); \`expand_entity_clusters\` also surfaces chunks about entities sharing a knowledge-graph cluster with the query's matches. These change RECALL AND ORDERING ONLY — none of them widens permissions or reveals content the user could not already read. Raising multi_query or enabling HyDE makes the user's next search cost more (more embedding calls, and HyDE adds a generation), so propose them when the evidence justifies it — zero-coverage terms in \`query_term_coverage\`, or a "low_confidence" \`rerank_status\` — not as a default. Staged only: the user still presses Search.`,
    valueType: "object",
    mode: "draft",
    applyPolicy: "ask",
    group: "pipeline_settings",
    sortOrder: 130,
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
You can also COMPOSE the next search rather than only describe it: the write targets stage the query text, the source-kind filter, and the retrieval knobs (rerank, multi_query, use_hyde, expand_entity_clusters) straight into the form. Staging is not running — the user presses Search, because every run costs an embedding call and HyDE and multi-query cost LLM calls on top. When a search comes back thin, the useful move is to rewrite the query in the vocabulary the documents would use and raise recall with ONE knob you can justify, then let the user run it. You cannot change which data store is searched or the admin ACL bypass; if the answer looks like it lives in a different store, say so and let the user pick it.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
  writeTargets,
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
