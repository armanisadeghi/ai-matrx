/**
 * features/rag/constants/search-pipeline.ts
 *
 * The RAG Search Lab's PIPELINE vocabulary — the one place that knows what a
 * retrieval pipeline setting can say. Deliberately dependency-free (no React,
 * no Redux, no imports) so every consumer shares it without a cycle:
 *
 *  - `RagSearchExperience`'s scope sidebar bounds its Multi-query and Limit
 *    inputs from these constants,
 *  - `rag-search.manifest.ts` interpolates them into the `retrieval_pipeline`
 *    write-target contract prose AND the `multi_query` / `result_limit` read
 *    value descriptions,
 *  - the Search tab's write handler validates agent input against them.
 *
 * The bound an agent is TOLD about, the bound its value is CHECKED against,
 * and the bound the UI actually enforces cannot drift apart — they are all
 * these constants. Never re-type these literals at a call site.
 *
 * Scope is NOT in here on purpose. Data store, source kinds, working-context
 * organization/scopes and the admin ACL bypass decide what the search is
 * ALLOWED to see; this module is only about how the search RUNS over whatever
 * it is already permitted to read.
 */

/**
 * Paraphrase fan-out: rewrite the query into N variants, each embedded and
 * fused via RRF. `1` means no expansion.
 *
 * The 1-5 range is the backend's own documented contract for
 * `RagSearchRequest.multi_query` (`features/rag/api/search.ts`), which the
 * sidebar's number input has always clamped to.
 */
export const MULTI_QUERY_MIN = 1;
export const MULTI_QUERY_MAX = 5;

/**
 * How many hits one search asks for.
 *
 * There is no backend-declared ceiling on `RagSearchRequest.limit`, so this is
 * the SURFACE's own bound, and it is deliberately conservative: every returned
 * hit carries a snippet into the surface payload an agent reads, so an
 * unbounded limit is a context bill, not extra insight. 50 is the largest
 * limit anything in this feature asks for today (`useDocumentSearch`), and the
 * Search tab's default of 25 is what it has always requested.
 */
export const RESULT_LIMIT_MIN = 1;
export const RESULT_LIMIT_MAX = 50;
export const RESULT_LIMIT_DEFAULT = 25;

/**
 * Longest query the search box accepts from a write. Not a backend limit — a
 * sanity bound so a staged "query" cannot be a pasted document the user would
 * have to clear by hand. The surface's `query` read value is described at a
 * typical 200 characters.
 */
export const SEARCH_QUERY_MAX_CHARS = 2000;

/**
 * The boolean pipeline flags, in the order the sidebar renders them. Used for
 * the write target's accepted-key list and its contract prose, so a flag can
 * never be documented without being accepted (or vice versa).
 */
export const PIPELINE_FLAGS = [
  {
    /** Key on the `retrieval_pipeline` write target AND the read value name. */
    key: "rerank",
    /** Sidebar label. */
    label: "Rerank results",
    /** Model-facing gloss, interpolated into the write-target contract. */
    summary:
      "re-order the fused candidates with the cross-encoder; on by default, and the single biggest quality lever",
  },
  {
    key: "use_hyde",
    label: "HyDE expansion",
    summary:
      "search with a hypothetical answer document as well as the query; helps when the user's words differ from the corpus's",
  },
  {
    key: "expand_entity_clusters",
    label: "Expand entity clusters",
    summary:
      "also surface chunks about entities sharing a knowledge-graph cluster with the query's matched entities; broadens recall, and the reranker filters",
  },
] as const;

/** One entry of {@link PIPELINE_FLAGS}. */
export type PipelineFlagSpec = (typeof PIPELINE_FLAGS)[number];

/** The boolean flag keys a `retrieval_pipeline` patch may carry. */
export const PIPELINE_FLAG_KEYS: readonly PipelineFlagSpec["key"][] =
  PIPELINE_FLAGS.map((flag) => flag.key);

/** Every key a `retrieval_pipeline` patch may carry, in contract order. */
export const PIPELINE_PATCH_KEYS: readonly string[] = [
  "rerank",
  "multi_query",
  "use_hyde",
  "expand_entity_clusters",
  "result_limit",
];

/** `"rerank | use_hyde | expand_entity_clusters"` — interpolate, never re-type. */
export const PIPELINE_FLAG_ENUM_TEXT = PIPELINE_FLAG_KEYS.join(" | ");

/** Runtime guard — the check the write handler runs on an agent's multi_query. */
export function isValidMultiQuery(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MULTI_QUERY_MIN &&
    value <= MULTI_QUERY_MAX
  );
}

/** Runtime guard — the check the write handler runs on an agent's result_limit. */
export function isValidResultLimit(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= RESULT_LIMIT_MIN &&
    value <= RESULT_LIMIT_MAX
  );
}

/** Clamp a user-typed number input into range (the UI's own coercion, never the agent's). */
export function clampMultiQuery(value: number): number {
  if (!Number.isFinite(value)) return MULTI_QUERY_MIN;
  return Math.max(MULTI_QUERY_MIN, Math.min(MULTI_QUERY_MAX, Math.trunc(value)));
}

/** Clamp a user-typed number input into range (the UI's own coercion, never the agent's). */
export function clampResultLimit(value: number): number {
  if (!Number.isFinite(value)) return RESULT_LIMIT_DEFAULT;
  return Math.max(
    RESULT_LIMIT_MIN,
    Math.min(RESULT_LIMIT_MAX, Math.trunc(value)),
  );
}
