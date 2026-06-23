/**
 * features/rag/api/search-lab.ts
 *
 * Typed client for the /rag/search-lab/* endpoints — diagnostics,
 * query-expansion preview, content inventory, and the transparent
 * Claude agent loop.
 *
 * Consumed by the multi-tab RAG search experience in
 * `features/rag/components/search/`.
 */
import { buildHeaders, postJson, resolveBaseUrl } from "@/lib/python-client";

// ---------------------------------------------------------------------------
// /expand — multi-query + HyDE preview
// ---------------------------------------------------------------------------

export interface ExpandRequest {
  query: string;
  multi_query?: number;
  use_hyde?: boolean;
}

export interface ExpandResponse {
  query: string;
  variants: string[];
  hyde_passage: string | null;
  embedding_model: string;
  query_vector_preview: number[];
  elapsed_ms: number;
}

export async function ragExpand(
  body: ExpandRequest,
  opts: { signal?: AbortSignal } = {},
): Promise<ExpandResponse> {
  const { data } = await postJson<ExpandResponse, ExpandRequest>(
    `/rag/search-lab/expand`,
    body,
    { signal: opts.signal },
  );
  return data;
}

// ---------------------------------------------------------------------------
// /inventory — what does this caller have access to?
// ---------------------------------------------------------------------------

export interface InventoryBucket {
  source_kind: string;
  visible_chunks: number;
  distinct_sources: number;
}

export interface InventoryTopSource {
  source_kind: string;
  source_id: string;
  chunk_count: number;
  file_name: string | null;
  organization_id: string | null;
  owner_id: string | null;
  processed_document_id: string | null;
}

export interface InventoryScope {
  user_id: string;
  organization_id: string | null;
  is_admin: boolean;
  admin_bypass_acl: boolean;
}

export interface InventoryResponse {
  scope: InventoryScope;
  total_visible_chunks: number;
  total_visible_sources: number;
  by_source_kind: InventoryBucket[];
  by_visibility_route: Record<string, number>;
  top_sources: InventoryTopSource[];
}

export async function ragInventory(
  opts: { adminBypassAcl?: boolean; signal?: AbortSignal } = {},
): Promise<InventoryResponse> {
  const qs = opts.adminBypassAcl ? "?admin_bypass_acl=true" : "";
  const { data } = await postJson<InventoryResponse, Record<string, never>>(
    `/rag/search-lab/inventory${qs}`,
    {},
    { signal: opts.signal },
  );
  return data;
}

// ---------------------------------------------------------------------------
// /diagnose — full pipeline trace for one query
// ---------------------------------------------------------------------------

export interface DiagnoseRequest {
  query: string;
  limit?: number;
  multi_query?: number;
  use_hyde?: boolean;
  rerank?: boolean;
  use_mmr?: boolean;
  only_children?: boolean;
  source_kinds?: string[];
  embedding_models?: string[];
  data_store_id?: string | null;
  admin_bypass_acl?: boolean;
  include_sources?: { source_kind: string; source_id: string }[];
  /** Admin-only org override — mirrors /rag/search filters.organization_id. */
  organization_id?: string | null;
  /** Structural scope filter (ctx_scope ids), same as /rag/search. */
  scope_ids?: string[] | null;
}

export interface DiagnoseHit {
  chunk_id: string;
  source_kind: string;
  source_id: string;
  chunk_kind: string;
  score: number;
  vector_rank: number | null;
  lexical_rank: number | null;
  rerank_score: number | null;
  snippet: string;
  metadata: Record<string, unknown>;
  file_name: string | null;
  page_number: number | null;
}

export interface DiagnoseResponse {
  query: string;
  scope: InventoryScope;
  elapsed_ms: number;
  query_variants: string[];
  hyde_passage: string | null;
  embedding_model: string;
  query_vector_preview: number[];
  visible_chunks_total: number;
  candidates_vector: number;
  candidates_lexical: number;
  candidates_entity?: number;
  candidates_after_fusion: number;
  candidates_after_mmr: number;
  hits: DiagnoseHit[];
  reranker_model: string | null;
  effective_filters: Record<string, unknown>;
  notes: string[];
}

export async function ragDiagnose(
  body: DiagnoseRequest,
  opts: { signal?: AbortSignal } = {},
): Promise<DiagnoseResponse> {
  const { data } = await postJson<DiagnoseResponse, DiagnoseRequest>(
    `/rag/search-lab/diagnose`,
    body,
    { signal: opts.signal },
  );
  return data;
}

// ---------------------------------------------------------------------------
// /diagnose/stream — same pipeline, streamed per-stage so the FE can fill
// the Agent Simulation panels progressively. Mirrors the event vocabulary
// from `aidream/api/routers/rag_search_lab.py` — one Pydantic model per
// kind on that side maps to one variant of the union below.
// ---------------------------------------------------------------------------

export type DiagnoseEvent =
  | { kind: "rag.diagnose.started"; query: string; scope: InventoryScope }
  | { kind: "rag.diagnose.note"; message: string }
  | {
      kind: "rag.diagnose.query_expansion";
      query_variants: string[];
      hyde_passage: string | null;
      embedding_model: string;
      query_vector_preview: number[];
    }
  | { kind: "rag.diagnose.visibility"; visible_chunks_total: number }
  | {
      kind: "rag.diagnose.fusion";
      candidates_after_fusion: number;
      candidates_vector: number;
      candidates_lexical: number;
      candidates_entity?: number;
    }
  | {
      kind: "rag.diagnose.hits";
      hits: DiagnoseHit[];
      reranker_model: string | null;
      candidates_after_mmr: number;
    }
  | {
      kind: "rag.diagnose.complete";
      elapsed_ms: number;
      effective_filters: Record<string, unknown>;
      notes: string[];
    };

export async function* ragDiagnoseStream(
  body: DiagnoseRequest,
  opts: { signal?: AbortSignal } = {},
): AsyncGenerator<DiagnoseEvent, void, void> {
  const url = `${resolveBaseUrl()}/rag/search-lab/diagnose/stream`;
  const { headers } = await buildHeaders({ signal: opts.signal }, true);
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Diagnose stream failed: ${res.status} ${text}`);
  }
  if (!res.body) throw new Error("No response body");

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += value;
      let nl = buf.indexOf("\n");
      while (nl >= 0) {
        const raw = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        nl = buf.indexOf("\n");
        if (!raw) continue;
        try {
          const env = JSON.parse(raw) as {
            event?: string;
            data?: { kind?: string } & Record<string, unknown>;
          };
          const payload = env.data;
          if (payload && typeof payload === "object" && "kind" in payload) {
            yield payload as DiagnoseEvent;
          }
        } catch {
          // ignore non-JSON lines (heartbeats etc.)
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// /tool/search — run the agent's ACTUAL rag_search tool (literal output)
//
// Reproduces, byte for byte, what the registered `rag_search` tool hands the
// model: same search() call, same output mappers (imported server-side from
// the package tool so they can't drift). Accepts the full agent arg surface
// and N queries. The UI then "plays out" rag_get_chunk on any hit.
// ---------------------------------------------------------------------------

export interface AgentToolSearchRequest {
  queries: string[];
  limit?: number;
  source_kinds?: string[] | null;
  data_store_id?: string | null;
  multi_query?: number;
  use_hyde?: boolean;
  rerank?: boolean;
  use_mmr?: boolean;
  scope_ids?: string[] | null;
  /** Admin-only org override (mirrors /rag/search). */
  organization_id?: string | null;
  include_sources?: { source_kind: string; source_id: string }[];
}

export interface AgentToolEntityMapLink {
  entity_id: string | null;
  name: string | null;
  kind: string | null;
  weight: number | null;
}

export interface AgentToolEntityMapEntry {
  entity_id: string | null;
  name: string | null;
  kind: string | null;
  mention_count: number | null;
  artifact_count: number | null;
  source_kind_counts: Record<string, number>;
  top_chunk_id: string | null;
  importance: number | null;
  is_concept: boolean;
  linked: AgentToolEntityMapLink[];
}

export interface AgentToolHit {
  chunk_id: string | null;
  source_kind: string | null;
  source_id: string | null;
  snippet: string;
  score: number | null;
  vector_rank: number | null;
  lexical_rank: number | null;
  rerank_score: number | null;
  metadata: Record<string, unknown>;
  entities: string[];
  entity_rank: number | null;
  file_name: string | null;
  page_number: number | null;
}

export interface AgentToolSearchOne {
  query: string;
  hits: AgentToolHit[];
  total_candidates: number;
  embedding_model: string;
  reranker_model: string | null;
  latency_ms: number;
  matched_entities: string[];
  entity_map: AgentToolEntityMapEntry[];
  /** The verbatim JSON string the model receives as the tool_result content. */
  tool_result_text: string;
  error: string | null;
}

export interface AgentToolSearchResponse {
  scope: InventoryScope;
  tool_name: string;
  args: Record<string, unknown>;
  results: AgentToolSearchOne[];
  notes: string[];
}

export async function ragAgentToolSearch(
  body: AgentToolSearchRequest,
  opts: { signal?: AbortSignal } = {},
): Promise<AgentToolSearchResponse> {
  const { data } = await postJson<
    AgentToolSearchResponse,
    AgentToolSearchRequest
  >(`/rag/search-lab/tool/search`, body, { signal: opts.signal });
  return data;
}

// ---------------------------------------------------------------------------
// /tool/get-chunk — "play out" the agent's next move (rag_get_chunk)
// ---------------------------------------------------------------------------

export interface AgentToolGetChunkRequest {
  chunk_id: string;
  include_parent?: boolean;
  /** Admin-only org override — should match the org used for the search. */
  organization_id?: string | null;
}

export interface AgentToolGetChunkResponse {
  status: "ok" | "not_found" | "forbidden";
  scope: InventoryScope;
  chunk: Record<string, unknown> | null;
  tool_result_text: string | null;
  note: string | null;
}

export async function ragAgentToolGetChunk(
  body: AgentToolGetChunkRequest,
  opts: { signal?: AbortSignal } = {},
): Promise<AgentToolGetChunkResponse> {
  const { data } = await postJson<
    AgentToolGetChunkResponse,
    AgentToolGetChunkRequest
  >(`/rag/search-lab/tool/get-chunk`, body, { signal: opts.signal });
  return data;
}

// ---------------------------------------------------------------------------
// /agent/chat — streaming Claude agent that uses rag_search as a tool
// ---------------------------------------------------------------------------

export interface AgentChatRequest {
  query: string;
  history?: { role: "user" | "assistant"; content: string }[];
  model?: string;
  data_store_id?: string | null;
  source_kinds?: string[];
  admin_bypass_acl?: boolean;
  rerank?: boolean;
  multi_query?: number;
  use_hyde?: boolean;
  max_tool_calls?: number;
}

export type AgentEvent =
  | { kind: "rag.agent.started"; model: string; max_tool_calls: number; admin_bypass_acl: boolean; data_store_id: string | null }
  | { kind: "rag.agent.turn.started"; turn: number }
  | { kind: "rag.agent.text"; turn: number; text: string }
  | { kind: "rag.agent.tool_call"; turn: number; tool_use_id: string; name: string; args: Record<string, unknown> }
  | {
      kind: "rag.agent.tool_result";
      turn: number;
      tool_use_id: string;
      n_hits: number;
      total_candidates: number;
      latency_ms: number;
      embedding_model: string;
      reranker_model: string | null;
      hits: AgentToolHit[];
    }
  | { kind: "rag.agent.tool_error"; turn: number; tool_use_id: string; message: string }
  | { kind: "rag.agent.warning"; message: string }
  | { kind: "rag.agent.error"; message: string }
  | { kind: "rag.agent.complete"; turn: number; stop_reason: string | null; tool_calls_made: number };

export interface AgentToolHit {
  rank: number;
  chunk_id: string;
  source_kind: string;
  source_id: string;
  score: number;
  file_name: string | null;
  page_number: number | null;
  snippet: string;
}

/**
 * Opens a streaming POST to /rag/search-lab/agent/chat and yields each
 * parsed event as it arrives. Stream is JSONL — one event per line, each
 * line a `{event, data}` envelope from matrx-connect's streaming.
 */
export async function* ragAgentChatStream(
  body: AgentChatRequest,
  opts: { signal?: AbortSignal } = {},
): AsyncGenerator<AgentEvent, void, void> {
  const url = `${resolveBaseUrl()}/rag/search-lab/agent/chat`;
  const { headers } = await buildHeaders({ signal: opts.signal }, true);
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Agent chat stream failed: ${res.status} ${text}`);
  }
  if (!res.body) throw new Error("No response body");

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += value;
      let nl = buf.indexOf("\n");
      while (nl >= 0) {
        const raw = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        nl = buf.indexOf("\n");
        if (!raw) continue;
        try {
          const env = JSON.parse(raw) as {
            event?: string;
            data?: { kind?: string } & Record<string, unknown>;
          };
          const payload = env.data;
          if (payload && typeof payload === "object" && "kind" in payload) {
            yield payload as AgentEvent;
          }
        } catch {
          // ignore non-JSON lines (heartbeats etc.)
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
