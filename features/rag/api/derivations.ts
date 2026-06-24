/**
 * features/rag/api/derivations.ts
 *
 * Typed client for the Knowledge-Asset "derivation" surface — the premium
 * representations the backend can build from an extracted document (table
 * rows, figure captions, multi-granularity chunks, page verification,
 * section summaries, synthetic Q&A).
 *
 *   GET  /rag/library/{id}/derivations        — rollup + recent runs
 *   POST /rag/library/{id}/derive/{kind}       — NDJSON progress stream
 *   POST /rag/library/derive-runs/{id}/cancel  — cancel an in-flight run
 *
 * Shares the exact wire envelope used by the per-stage runners in
 * `stages.ts` (matrx-connect data/completion/error events). This module
 * flattens that into a typed stream the Knowledge Asset UI renders.
 *
 * Cancel nuance (verified against aidream `rag.py::_run_derive_stream`):
 * when a run is cancelled the backend emits a `phase:"error"` progress
 * event carrying `extra.cancelled === true` (NOT a `rag.stage.result`),
 * then ends the stream. Callers must treat that as a cancellation, not a
 * failure — `runDeriveStream` surfaces it as a dedicated `derive.cancelled`
 * event so the runner never paints a cancelled op red.
 */

import {
  buildHeaders,
  getJson,
  postJson,
  resolveBaseUrl,
} from "@/lib/python-client";

// ---------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------

/** The six derivation operations the backend exposes. Order here is the
 *  canonical "Build All" order (verification first so the rest derives off a
 *  verified base). */
export const DERIVE_KINDS = [
  "page_verification",
  "table_row",
  "multigranularity",
  "page_image_caption",
  "section_summary",
  "synthetic_qa",
] as const;

export type DeriveKind = (typeof DERIVE_KINDS)[number];

export function isDeriveKind(value: string): value is DeriveKind {
  return (DERIVE_KINDS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Rollup read (GET /derivations)
// ---------------------------------------------------------------------------

export type DeriveRunStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface DerivationRollup {
  /** May be one of DeriveKind, but the backend can also surface other
   *  parent-derived kinds (e.g. `initial_extract`); keep it a string. */
  derivation_kind: string;
  derivative_id: string;
  chunk_count: number;
  updated_at: string | null;
}

export interface DerivationRun {
  run_id: string;
  derivation_kind: string;
  status: DeriveRunStatus;
  current: number;
  total: number;
  chunks_written: number;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface DerivationsResponse {
  derivations: DerivationRollup[];
  runs: DerivationRun[];
}

export async function fetchDerivations(
  processedDocumentId: string,
  signal?: AbortSignal,
): Promise<DerivationsResponse> {
  const { data } = await getJson<DerivationsResponse>(
    `/rag/library/${encodeURIComponent(processedDocumentId)}/derivations`,
    { signal },
  );
  return {
    derivations: Array.isArray(data?.derivations) ? data.derivations : [],
    runs: Array.isArray(data?.runs) ? data.runs : [],
  };
}

// ---------------------------------------------------------------------------
// Reality estimate (GET /estimate)
//
// Tells the UI, BEFORE the user spends, exactly how many runs each derivation
// will do, the scope (rows/pages/sections), and a rough cost — so a card can
// show "25 sections → 25 Gemini runs · ~$0.05" instead of a blind Build button.
// One DB read + one PDF scan on the backend (a few seconds on a large doc).
// Backend: aidream rag.py::estimate_derivations_endpoint → knowledge_derivations.estimate_derivations.
// ---------------------------------------------------------------------------

export interface DeriveEstimate {
  /** How many model/vision calls this derivation will make. 0 for
   *  deterministic kinds (table_row, multigranularity) and read-only ones. */
  runs: number;
  /** Unit noun for `items` (rows, sections, figure pages, …). */
  unit: string;
  /** How many `unit`s exist in the doc (e.g. 62 rows). */
  items: number;
  /** Human one-liner the card surfaces verbatim, e.g.
   *  "1 Gemini run / section · 25 runs". */
  note: string;
  /** Rough USD cost (order-of-magnitude; shown as "~$X"). */
  cost_usd: number;
}

export interface DocEstimateShape {
  pages: number;
  sections: number;
  tables: number;
  rows: number;
  figure_pages: number;
}

export interface DerivationsEstimate {
  name: string;
  doc: DocEstimateShape;
  /** Keyed by DeriveKind. Backend may omit kinds it can't estimate; callers
   *  must treat a missing key as "unknown", not "zero". */
  estimates: Partial<Record<DeriveKind, DeriveEstimate>>;
}

function isDocEstimate(v: unknown): v is DocEstimateShape {
  if (!v || typeof v !== "object") return false;
  const d = v as Record<string, unknown>;
  return ["pages", "sections", "tables", "rows", "figure_pages"].every(
    (k) => typeof d[k] === "number",
  );
}

export async function fetchEstimate(
  processedDocumentId: string,
  signal?: AbortSignal,
): Promise<DerivationsEstimate> {
  const { data } = await getJson<DerivationsEstimate>(
    `/rag/library/${encodeURIComponent(processedDocumentId)}/estimate`,
    // The estimate does a live PDF scan (tables/figures/sections); on a large
    // doc it can take well over the default 30s. Give it room so our own fetch
    // timeout doesn't turn a slow scan into "scope estimate unavailable".
    { signal, timeoutMs: 120_000 },
  );
  return {
    name: typeof data?.name === "string" ? data.name : "",
    doc: isDocEstimate(data?.doc)
      ? data.doc
      : { pages: 0, sections: 0, tables: 0, rows: 0, figure_pages: 0 },
    estimates:
      data?.estimates && typeof data.estimates === "object"
        ? data.estimates
        : {},
  };
}

// ---------------------------------------------------------------------------
// Derivative chunks read (GET /chunks on the derivative's own id)
//
// A derivation set IS a processed_document (a child of the source doc), so the
// existing chunks endpoint serves its rows directly — this is how the UI makes
// "Table rows: 62" actually SHOWable: fetch the derivative's chunks and render
// each one with page provenance. The endpoint owner-checks via the parent doc's
// ownership, which derivatives inherit.
// ---------------------------------------------------------------------------

export interface DerivativeChunkRow {
  id: string;
  chunk_index: number | null;
  chunk_kind: string | null;
  parent_chunk_id: string | null;
  page_numbers: number[] | null;
  token_count: number | null;
  content_text: string;
  has_oai_embedding: boolean;
  has_voyage_embedding: boolean;
  section_kind: string | null;
  /** Full chunk metadata passthrough — e.g. table_row chunks carry
   *  header / cells / table_index / row_index so the UI can rebuild real grids. */
  metadata?: Record<string, unknown> | null;
}

export interface DerivativeChunksResponse {
  chunks: DerivativeChunkRow[];
  total: number;
  limit: number;
  offset: number;
}

export async function fetchDerivativeChunks(
  derivativeId: string,
  opts: { limit?: number; offset?: number; signal?: AbortSignal } = {},
): Promise<DerivativeChunksResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(opts.limit ?? 50));
  if (opts.offset) params.set("offset", String(opts.offset));
  const { data } = await getJson<DerivativeChunksResponse>(
    `/rag/library/${encodeURIComponent(derivativeId)}/chunks?${params.toString()}`,
    { signal: opts.signal },
  );
  return {
    chunks: Array.isArray(data?.chunks) ? data.chunks : [],
    total: typeof data?.total === "number" ? data.total : 0,
    limit: typeof data?.limit === "number" ? data.limit : opts.limit ?? 50,
    offset: typeof data?.offset === "number" ? data.offset : opts.offset ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Streaming runner (POST /derive/{kind})
// ---------------------------------------------------------------------------

export type DerivePhase = "started" | "progress" | "heartbeat" | "done" | "error";

export interface DeriveStartedEvent {
  event: "derive.started";
  data: {
    kind: DeriveKind;
    /** Captured here so the caller can address the cancel endpoint. */
    runId: string | null;
  };
}

export interface DeriveProgressEvent {
  event: "derive.progress";
  data: {
    kind: DeriveKind;
    phase: DerivePhase;
    message: string;
    current: number;
    total: number;
    extra: Record<string, unknown>;
  };
}

export interface DeriveResultEvent {
  event: "derive.result";
  data: {
    kind: DeriveKind;
    ok: boolean;
    processedDocumentId: string | null;
    chunksWritten: number;
    error: string | null;
    runId: string | null;
  };
}

/** Cooperative cancellation acknowledged by the server (phase:"error" with
 *  extra.cancelled). Distinct from a real failure. */
export interface DeriveCancelledEvent {
  event: "derive.cancelled";
  data: { kind: DeriveKind; runId: string | null };
}

export interface DeriveErrorEvent {
  event: "derive.error";
  data: { kind: DeriveKind; message: string };
}

export interface DeriveEndEvent {
  event: "derive.end";
  data: Record<string, unknown>;
}

export type DeriveStreamEvent =
  | DeriveStartedEvent
  | DeriveProgressEvent
  | DeriveResultEvent
  | DeriveCancelledEvent
  | DeriveErrorEvent
  | DeriveEndEvent;

export async function* runDeriveStream(
  processedDocumentId: string,
  kind: DeriveKind,
  opts: { signal?: AbortSignal } = {},
): AsyncGenerator<DeriveStreamEvent, void, void> {
  const url = `${resolveBaseUrl()}/rag/library/${encodeURIComponent(
    processedDocumentId,
  )}/derive/${encodeURIComponent(kind)}`;

  const { headers } = await buildHeaders({ signal: opts.signal }, true);
  const response = await fetch(url, {
    method: "POST",
    headers,
    signal: opts.signal,
  });
  if (!response.ok || !response.body) {
    yield {
      event: "derive.error",
      data: { kind, message: `HTTP ${response.status}` },
    };
    return;
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;
      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line.length > 0) {
          const ev = parseLine(line, kind);
          if (ev) yield ev;
        }
        nl = buffer.indexOf("\n");
      }
    }
    if (buffer.trim().length > 0) {
      const ev = parseLine(buffer, kind);
      if (ev) yield ev;
    }
  } finally {
    reader.releaseLock();
  }
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function parseLine(line: string, kind: DeriveKind): DeriveStreamEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;

  const env = raw as { event?: string; data?: Record<string, unknown> };
  const evName = asString(env.event);
  const data = (env.data ?? {}) as Record<string, unknown>;

  if (evName === "data") {
    const dataKind = asString(data.kind);
    const stageKind = (asString(data.stage) as DeriveKind) || kind;
    const extra = (data.extra as Record<string, unknown>) ?? {};
    const runId =
      typeof extra.run_id === "string" ? extra.run_id : null;

    if (dataKind === "rag.stage.progress") {
      const phase = (asString(data.phase) || "progress") as DerivePhase;

      // started — carry the run_id out so the caller can cancel.
      if (phase === "started") {
        return { event: "derive.started", data: { kind: stageKind, runId } };
      }

      // error phase with extra.cancelled === true is a cooperative cancel,
      // not a failure (verified against aidream _run_derive_stream).
      if (phase === "error" && extra.cancelled === true) {
        return { event: "derive.cancelled", data: { kind: stageKind, runId } };
      }
      if (phase === "error") {
        return {
          event: "derive.error",
          data: {
            kind: stageKind,
            message: asString(data.message, "Derivation failed"),
          },
        };
      }

      return {
        event: "derive.progress",
        data: {
          kind: stageKind,
          phase,
          message: asString(data.message),
          current: asNumber(data.current),
          total: asNumber(data.total),
          extra,
        },
      };
    }

    if (dataKind === "rag.stage.result") {
      const ok = data.ok === true;
      return {
        event: "derive.result",
        data: {
          kind: stageKind,
          ok,
          processedDocumentId:
            typeof data.processed_document_id === "string"
              ? data.processed_document_id
              : null,
          chunksWritten: asNumber(data.chunks_written),
          error: typeof data.error === "string" ? data.error : null,
          runId,
        },
      };
    }
    return null;
  }

  if (evName === "completion" || evName === "end") {
    return { event: "derive.end", data };
  }

  if (evName === "error") {
    return {
      event: "derive.error",
      data: { kind, message: asString(data.message, "Stream error") },
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cancel (POST /derive-runs/{id}/cancel)
// ---------------------------------------------------------------------------

export interface CancelDeriveRunResponse {
  ok: boolean;
  status: DeriveRunStatus;
}

export async function cancelDeriveRun(
  runId: string,
  signal?: AbortSignal,
): Promise<CancelDeriveRunResponse> {
  const { data } = await postJson<CancelDeriveRunResponse>(
    `/rag/library/derive-runs/${encodeURIComponent(runId)}/cancel`,
    {},
    { signal },
  );
  return data;
}
