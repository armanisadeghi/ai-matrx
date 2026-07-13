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
import { apiPost } from "@/lib/api/typed-client";
import type { components } from "@/types/python-generated/api-types";

// ---------------------------------------------------------------------------
// /expand — multi-query + HyDE preview
// ---------------------------------------------------------------------------

// Request body DERIVED from the generated OpenAPI contract, never hand-mirrored
// — defaulted fields are optional on the wire, so callers omit them.
export type ExpandRequest = components["schemas"]["ExpandRequest"];

// Derived from the generated OpenAPI contract, never hand-mirrored. NOTE:
// `query_vector_preview` is OPTIONAL in the contract — consumers must guard
// (the previous hand-mirror marked it required and shipped an unguarded
// dereference; see FOUND_DEFECTS.md D44).
export type ExpandResponse = components["schemas"]["ExpandResponse"];

export async function ragExpand(
  body: ExpandRequest,
  opts: { signal?: AbortSignal } = {},
): Promise<ExpandResponse> {
  const { data } = await apiPost("/rag/search-lab/expand", body, {
    signal: opts.signal,
  });
  return data;
}

// ---------------------------------------------------------------------------
// /inventory — what does this caller have access to?
// ---------------------------------------------------------------------------

// Derived from the generated OpenAPI contract, never hand-mirrored — a backend
// rename/shape change turns every drifted callsite into a compile error after
// `pnpm sync-types`. (`InventoryScope`/`InventoryTopSource` are the FE names for
// the backend `ScopeContext`/`TopSource` schemas.)
export type InventoryBucket = components["schemas"]["InventoryBucket"];
export type InventoryTopSource = components["schemas"]["TopSource"];
export type InventoryScope = components["schemas"]["ScopeContext"];

// NOTE: `by_visibility_route` is OPTIONAL in the contract — consumers must
// guard (calm empty state), not iterate it unguarded (FOUND_DEFECTS.md D44).
export type InventoryResponse = components["schemas"]["InventoryResponse"];

export async function ragInventory(
  opts: { adminBypassAcl?: boolean; signal?: AbortSignal } = {},
): Promise<InventoryResponse> {
  // Raw client: the contract declares NO requestBody for this endpoint
  // (`admin_bypass_acl` is a query param), so `apiPost` derives an empty body
  // and would drop the historical `{}` payload this call has always sent.
  // Response type is still contract-derived (InventoryResponse alias above).
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

// Request body DERIVED from the generated OpenAPI contract, never hand-mirrored
// — defaulted fields are optional on the wire, so callers omit them.
export type DiagnoseRequest = components["schemas"]["DiagnoseRequest"];

// Derived from the contract, never hand-mirrored. NOTE: unlike the search
// lane's `RagSearchHit`, DiagnoseHit carries NO entity-lane provenance —
// the server model is `extra="forbid"` and never maps entity_rank/entities
// (batch or stream). If diagnose ever needs the "entity match only" flag,
// that is an aidream API change, not an FE type extension.
export type DiagnoseHit = components["schemas"]["DiagnoseHit"];

export type DiagnoseResponse = components["schemas"]["DiagnoseResponse"];

export async function ragDiagnose(
  body: DiagnoseRequest,
  opts: { signal?: AbortSignal } = {},
): Promise<DiagnoseResponse> {
  const { data } = await apiPost("/rag/search-lab/diagnose", body, {
    signal: opts.signal,
  });
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

// Request body DERIVED from the generated OpenAPI contract, never hand-mirrored
// — defaulted fields are optional on the wire, so callers omit them.
export type AgentToolSearchRequest =
  components["schemas"]["AgentToolSearchRequest"];

// Response shapes DERIVED from the generated OpenAPI contract, never
// hand-mirrored — a backend rename/shape change becomes a compile error after
// `pnpm sync-types` instead of a silent runtime drift.
export type AgentToolEntityMapLink =
  components["schemas"]["AgentToolEntityMapLink"];

export type AgentToolEntityMapEntry =
  components["schemas"]["AgentToolEntityMapEntry"];

export type AgentToolHit = components["schemas"]["AgentToolHit"];

export type AgentToolSearchOne = components["schemas"]["AgentToolSearchOne"];

export type AgentToolSearchResponse =
  components["schemas"]["AgentToolSearchResponse"];

export async function ragAgentToolSearch(
  body: AgentToolSearchRequest,
  opts: { signal?: AbortSignal } = {},
): Promise<AgentToolSearchResponse> {
  const { data } = await apiPost("/rag/search-lab/tool/search", body, {
    signal: opts.signal,
  });
  return data;
}

// ---------------------------------------------------------------------------
// /tool/get-chunk — "play out" the agent's next move (rag_get_chunk)
// ---------------------------------------------------------------------------

// Request body DERIVED from the generated OpenAPI contract, never hand-mirrored.
export type AgentToolGetChunkRequest =
  components["schemas"]["AgentToolGetChunkRequest"];

export type AgentToolGetChunkResponse =
  components["schemas"]["AgentToolGetChunkResponse"];

export async function ragAgentToolGetChunk(
  body: AgentToolGetChunkRequest,
  opts: { signal?: AbortSignal } = {},
): Promise<AgentToolGetChunkResponse> {
  const { data } = await apiPost("/rag/search-lab/tool/get-chunk", body, {
    signal: opts.signal,
  });
  return data;
}
