/**
 * features/rag/api/ingest.ts
 *
 * Wrapper around the RAG team's `/rag/ingest` and `/rag/ingest/stream`
 * endpoints, scoped to the file-centric UX:
 *
 *   "Process this file for RAG."
 *   "Reprocess (force) this file."
 *
 * The cloud-files surfaces never need to think about `source_kind` —
 * a file is always `cld_file` from this codepath. If/when the Python
 * team adds `POST /files/{file_id}/ingest` (item 14b in REQUESTS.md)
 * we swap the URL inside this module without disturbing call sites.
 *
 * Streaming variant returns an async iterator of progress events the
 * UI renders as a per-stage progress bar (fetch → extract → cleanup →
 * chunk → embed → upsert → complete). Cancelable via AbortController.
 */
import {
  buildHeaders,
  postJson,
  resolveBaseUrl,
} from "@/lib/python-client";

export interface IngestResponse {
  source_kind: string;
  source_id: string;
  field_id: string | null;
  chunks_written: number;
  embeddings_written: number;
  skipped_unchanged: boolean;
  embedding_model: string;
  error: string | null;
  /**
   * Set when the backend grows the convenience wrapper that
   * surfaces the resulting processed_documents row id directly in
   * the response — until then, the FE re-probes via document-lookup.
   */
  processed_document_id?: string;
}

export interface IngestRequestBody {
  source_kind: "cld_file" | "note" | "code_file";
  source_id: string;
  field_id?: string | null;
  force?: boolean;
}

/** Non-streaming ingest. Resolves with the final `IngestResponse`. */
export async function ingestFile(
  fileId: string,
  opts: { force?: boolean; signal?: AbortSignal } = {},
): Promise<IngestResponse> {
  const { data } = await postJson<IngestResponse, IngestRequestBody>(
    `/rag/ingest`,
    {
      source_kind: "cld_file",
      source_id: fileId,
      force: opts.force ?? false,
    },
    { signal: opts.signal },
  );
  return data;
}

// ---------------------------------------------------------------------------
// Streaming variant — Server-Sent Events / NDJSON line stream.
// Each line is a JSON object `{ event, data }`. The stage events let the
// UI show per-step progress; the final `complete` event carries the
// IngestResponse-equivalent payload.
// ---------------------------------------------------------------------------

export type IngestStreamEvent =
  | { event: "rag.ingest.progress"; data: IngestProgress }
  | { event: "rag.ingest.complete"; data: IngestResponse }
  | { event: "rag.ingest.error"; data: { message: string } };

export interface IngestProgress {
  stage:
    | "fetch"
    | "extract"
    | "cleanup"
    | "chunk"
    | "embed"
    | "upsert"
    | "complete";
  current: number;
  total: number;
  message?: string;
  /** Sample of actual content produced by this stage. Forwarded from the
   *  backend's `extra.preview` so the FE dialog can show the user what
   *  the system extracted/cleaned/chunked instead of just a counter. */
  preview?: Record<string, unknown> | null;
}

/**
 * Subscribe to ingest progress via NDJSON streaming. Returns an async
 * iterable; consume with `for await`. Cancel via the signal.
 *
 *   const ac = new AbortController();
 *   for await (const evt of ingestFileStream(id, { signal: ac.signal })) {
 *     if (evt.event === "rag.ingest.progress") setProgress(evt.data);
 *     if (evt.event === "rag.ingest.complete") onDone(evt.data);
 *   }
 */
export async function* ingestFileStream(
  fileId: string,
  opts: { force?: boolean; signal?: AbortSignal } = {},
): AsyncGenerator<IngestStreamEvent, void, void> {
  const body: IngestRequestBody = {
    source_kind: "cld_file",
    source_id: fileId,
    force: opts.force ?? false,
  };
  // Reuse the same auth/CSRF/baseUrl plumbing as the JSON helpers.
  // The JSON helpers throw on non-OK; we want the stream to emit a
  // structured error event before terminating, so we open the fetch
  // ourselves but pull the headers from the same factory.
  const { headers } = await buildHeaders({ signal: opts.signal }, true);
  const response = await fetch(`${resolveBaseUrl()}/rag/ingest/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!response.ok || !response.body) {
    yield {
      event: "rag.ingest.error",
      data: { message: `HTTP ${response.status}` },
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
          const translated = parseLine(line);
          if (translated) yield translated;
        }
        nl = buffer.indexOf("\n");
      }
    }
    if (buffer.trim().length > 0) {
      const translated = parseLine(buffer);
      if (translated) yield translated;
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Wire-format adapter
//
// The backend (matrx-connect StreamEmitter) writes generic envelopes:
//   {"event": "data",       "data": {"kind": "rag.ingest.progress", ...}}
//   {"event": "data",       "data": {"kind": "rag.ingest.result",   "error": "..."}}
//   {"event": "phase",      "data": {"phase": "..."}}
//   {"event": "completion", "data": {...}}
//   {"event": "error",      "data": {...}}
//
// The hook + UI think in three FE-namespaced events: progress / complete
// / error. This adapter inspects `data.kind` and produces the shape the
// hook consumes. Returns null for envelopes we don't care about (phase
// markers, etc.) — the loop just skips those.
// ---------------------------------------------------------------------------
function parseLine(line: string): IngestStreamEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const env = raw as { event?: string; data?: unknown };

  // Stream-level error (matrx-connect ERROR event) — maps directly.
  if (env.event === "error") {
    const d = (env.data ?? {}) as { message?: string; error_type?: string };
    return {
      event: "rag.ingest.error",
      data: { message: d.message ?? d.error_type ?? "Ingest failed" },
    };
  }

  // Everything else is namespaced inside `data.kind`.
  const data = (env.data ?? {}) as { kind?: string } & Record<string, unknown>;
  const kind = data.kind;

  if (kind === "rag.ingest.progress") {
    // The backend emits stage-specific counter keys (pages_*, chunks_*),
    // NOT generic current/total. Map them so the FE has one shape to render.
    // - extract / cleanup            → pages
    // - chunk / embed / upsert       → chunks
    // - fetch / complete / error     → no counters (0 / 0)
    const stage = (data.stage as IngestProgress["stage"]) ?? "fetch";
    const pagesDone = data.pages_done as number | undefined;
    const pagesTotal = data.pages_total as number | undefined;
    const chunksDone = data.chunks_done as number | undefined;
    const chunksTotal = data.chunks_total as number | undefined;
    let current = 0;
    let total = 0;
    if (stage === "extract" || stage === "cleanup") {
      current = pagesDone ?? 0;
      total = pagesTotal ?? 0;
    } else if (stage === "chunk" || stage === "embed" || stage === "upsert") {
      current = chunksDone ?? 0;
      total = chunksTotal ?? 0;
    }
    // Fallback: if the backend ever sends generic current/total, honour them.
    if (total === 0 && typeof data.total === "number") {
      total = data.total as number;
      current = (data.current as number) ?? 0;
    }
    // Forward the per-stage `preview` payload (page text, before/after,
    // chunks sample) so the FE dialog can render real content.
    const previewVal =
      typeof data.preview === "object" && data.preview !== null
        ? (data.preview as Record<string, unknown>)
        : null;
    return {
      event: "rag.ingest.progress",
      data: {
        stage,
        current,
        total,
        message: (data.message as string) ?? undefined,
        preview: previewVal,
      },
    };
  }

  if (kind === "rag.ingest.result") {
    // The backend emits a single result event. Dispatch to either
    // "complete" (success) or "error" depending on the error field.
    const result = data as unknown as IngestResponse;
    if (result.error) {
      return {
        event: "rag.ingest.error",
        data: { message: result.error },
      };
    }
    return {
      event: "rag.ingest.complete",
      data: result,
    };
  }

  // Phase / heartbeat / completion / chunk / unknown — the UI doesn't
  // consume these directly. Returning null lets the stream loop continue.
  return null;
}
