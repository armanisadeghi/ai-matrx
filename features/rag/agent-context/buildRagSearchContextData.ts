import type { PlacementMode } from "@/features/context-menu-v2/UnifiedAgentContextMenu";
import { createRagSearchScope } from "@/features/surfaces/manifests/rag-search.manifest";
import type { RagSearchHit, RagSearchResponse } from "@/features/rag/api/search";

/**
 * Placement visibility for the `matrx-user/rag-search` surface menu.
 *
 * Both regions this surface wires are effectively read-only at the text level:
 * the search box holds a single short query and the results list is rendered
 * (presentational). So the editor-only `content-block` placement (insert a
 * template at the cursor) is hidden; everything else — AI actions, bound
 * agents, org/user tools, quick actions — stays available so the user can act
 * on the query they typed or the passages they're reading. Modeled as
 * `placementMode` (the modern API) rather than the deprecated
 * `enabledPlacements`.
 */
export const RAG_SEARCH_CONTEXT_MENU_PLACEMENT_MODE: PlacementMode = {
  "ai-action": "show",
  "bound-agent": "show",
  "content-block": "hide",
  "organization-tool": "show",
  "user-tool": "show",
  "quick-action": "show",
};

/**
 * Shared menu props for `matrx-user/rag-search` (editable search box +
 * presentational results). Mount this on every region with
 * `isEditable` decided per-region by the caller (search box: `true`;
 * results: `false`) so `isEditable` is never baked into the shared object.
 *
 * `sourceFeature` is the valid `SourceFeature` literal `"rag-search"` — already
 * in the union (added for this surface's Agent Chat tab) — so no closest-match
 * substitution is needed.
 */
export const RAG_SEARCH_CONTEXT_MENU_PROPS = {
  sourceFeature: "rag-search" as const,
  surfaceName: "matrx-user/rag-search" as const,
  placementMode: RAG_SEARCH_CONTEXT_MENU_PLACEMENT_MODE,
};

/** Cap how much of any single passage feeds the surface `content`/`context`. */
const PER_HIT_SNIPPET_CHARS = 800;
/** Cap the joined results blob so the context payload stays bounded. */
const RESULTS_CONTENT_CHARS = 12000;

function hitFileName(hit: RagSearchHit): string | undefined {
  const fromMeta = hit.metadata?.["source_label"];
  if (typeof fromMeta === "string" && fromMeta) return fromMeta;
  const src = (hit.metadata?.["source"] ?? {}) as Record<string, unknown>;
  const name =
    (src.file_name as string | undefined) ??
    (src.title as string | undefined) ??
    (src.path as string | undefined);
  return name || undefined;
}

function hitPageNumber(hit: RagSearchHit): number | undefined {
  const raw = hit.metadata?.["page_number"];
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Compact, agent-readable summary of one hit (no raw metadata dump). */
function summarizeHit(hit: RagSearchHit, rank: number) {
  return {
    rank,
    chunk_id: hit.chunk_id,
    source_kind: hit.source_kind,
    source_id: hit.source_id,
    file_name: hitFileName(hit),
    page_number: hitPageNumber(hit),
    score: hit.score,
    snippet: hit.snippet.slice(0, PER_HIT_SNIPPET_CHARS),
  };
}

/** The readable passage text the user sees, joined into one `content` blob. */
function joinResultsText(hits: readonly RagSearchHit[]): string {
  const lines: string[] = [];
  hits.forEach((hit, i) => {
    const name = hitFileName(hit) ?? `(${hit.source_kind})`;
    const page = hitPageNumber(hit);
    const header = `#${i + 1} ${name}${page ? ` · p.${page}` : ""} · ${hit.source_kind} · score ${hit.score.toFixed(3)}`;
    lines.push(header);
    lines.push(hit.snippet.slice(0, PER_HIT_SNIPPET_CHARS));
    lines.push("");
  });
  return lines.join("\n").slice(0, RESULTS_CONTENT_CHARS);
}

export interface BuildRagSearchContextDataArgs {
  /** Current query in the search box. Empty before the user types. */
  query: string;
  /** Selected data store id (`null`/undefined = all accessible content). */
  dataStoreId?: string | null;
  /** Human-readable name of the selected store, when one is selected. */
  dataStoreName?: string | null;
  /** Active source-kind filter, e.g. `["note"]`. Undefined/empty = "All". */
  sourceKinds?: string[];
  /** Admin "bypass ACL" toggle state. */
  adminBypass?: boolean;
  /** Cross-encoder rerank toggle (defaults to true on the page; only takes
   *  effect when a reranker is configured on the server). */
  rerank?: boolean;
  /** Multi-query expansion count (1-5; 1 = no expansion). */
  multiQuery?: number;
  /** HyDE query-expansion toggle. */
  useHyde?: boolean;
  /**
   * The most recent search response, when results are on screen. Drives the
   * presentational region's `content` (the readable passages) and the rich
   * result-summary custom values. Omit for the bare search box.
   */
  response?: RagSearchResponse | null;
  /**
   * Browser text selection scoped to this surface, when the user highlighted
   * displayed passages (presentational region). The editable region captures
   * its own selection live from the input ref via `getApplicationScope`.
   */
  selectionText?: string;
}

/**
 * Canonical `contextData` for `matrx-user/rag-search`.
 *
 * Pure mapping of live search state → `createRagSearchScope(...)`, so a runtime
 * caller and any demo share one shape. Emits the auto-injected baselines with
 * real values where the surface has them (`content` = the joined result
 * passages when present, else the query; `selection` = a highlighted passage;
 * `context` = a small retrieval-scope blob) plus every custom value the
 * manifest declares that the page can source.
 */
export function buildRagSearchContextData(
  args: BuildRagSearchContextDataArgs,
): Record<string, unknown> {
  const {
    query,
    dataStoreId,
    dataStoreName,
    sourceKinds,
    adminBypass = false,
    rerank = true,
    multiQuery = 1,
    useHyde = false,
    response = null,
    selectionText = "",
  } = args;

  const trimmedQuery = query.trim();
  const hasResults = (response?.hits.length ?? 0) > 0;
  const hasSelection = selectionText.length > 0;

  const resultsText = response ? joinResultsText(response.hits) : "";

  // `content` is the readable passages when results are on screen, else the
  // query the user typed — so an agent acting on this surface sees the text
  // the user is actually looking at. The editable search box's live input
  // value still wins at click-time via `buildApplicationScopeFromMenuContext`.
  const content = hasResults
    ? resultsText
    : trimmedQuery
      ? trimmedQuery
      : undefined;

  // Small surface blob describing the current retrieval scope + last result
  // stats. Bound into the agent `context` slot; cheap, no raw metadata dump.
  const surround: Record<string, unknown> = {
    surface: "rag-search",
    query: trimmedQuery || undefined,
    data_store_id: dataStoreId || undefined,
    data_store_name: dataStoreName || undefined,
    source_kinds: sourceKinds && sourceKinds.length > 0 ? sourceKinds : "all",
    admin_bypass_acl: adminBypass,
    rerank,
    multi_query: multiQuery,
    use_hyde: useHyde,
    result_count: response?.hits.length,
    total_candidates: response?.total_candidates,
    latency_ms: response?.latency_ms,
    reranker_model: response?.reranker_model ?? undefined,
    embedding_model: response?.embedding_model || undefined,
  };

  const scope = createRagSearchScope({
    // Baselines (real values where the surface has them)
    selection: hasSelection ? selectionText : undefined,
    content,
    context: surround,

    // Custom values — names match the manifest EXACTLY
    query: trimmedQuery || undefined,
    data_store_id: dataStoreId || undefined,
    data_store_name: dataStoreName || undefined,
    source_kinds:
      sourceKinds && sourceKinds.length > 0 ? sourceKinds : undefined,
    admin_bypass_acl: adminBypass || undefined,
    rerank,
    multi_query: multiQuery,
    use_hyde: useHyde || undefined,
  });

  // Extra non-manifest result context rides along on the payload — the launch
  // thunk only maps declared values into agent slots, and the bound-agent run
  // carries the full `contextData`, so surfacing the displayed results (which
  // have no dedicated SurfaceValue) is additive and never clobbers a binding.
  const extras: Record<string, unknown> = {};
  if (response) {
    extras.result_count = response.hits.length;
    extras.total_candidates = response.total_candidates;
    extras.search_results = response.hits.map((h, i) => summarizeHit(h, i + 1));
    extras.source_ids = Array.from(
      new Set(response.hits.map((h) => h.source_id)),
    );
    extras.result_scores = response.hits.map((h) => h.score);
  }

  return { ...(scope as Record<string, unknown>), ...extras };
}
