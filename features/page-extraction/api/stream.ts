/**
 * features/page-extraction/api/stream.ts
 *
 * NDJSON SSE client for `POST /page-extraction/runs/stream`. Mirrors the
 * shape of `features/rag/api/ingest.ts` so the wire-format adapter logic
 * stays consistent across streaming endpoints.
 */

import {
  buildHeaders,
  postJson,
  resolveBaseUrl,
} from "@/lib/python-client";
import type {
  ExtractionStreamEvent,
  RunExtractionRequest,
} from "@/features/page-extraction/types";

const RUN_STREAM_PATH = "/page-extraction/runs/stream";

/**
 * Subscribe to extraction progress via NDJSON streaming. Returns an async
 * iterable; consume with `for await`. Cancel via the AbortSignal.
 *
 *   const ac = new AbortController();
 *   for await (const evt of runExtractionStream(req, { signal: ac.signal })) {
 *     if (evt.event === "page_run.completed") tick(evt.data);
 *     if (evt.event === "run.completed") onDone(evt.data);
 *   }
 */
export async function* runExtractionStream(
  body: RunExtractionRequest,
  opts: { signal?: AbortSignal } = {},
): AsyncGenerator<ExtractionStreamEvent, void, void> {
  const { headers } = await buildHeaders({ signal: opts.signal }, true);
  const response = await fetch(`${resolveBaseUrl()}${RUN_STREAM_PATH}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!response.ok || !response.body) {
    yield {
      event: "stream.error",
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

/**
 * Retry a single chunk. Replaces the existing page_run row + its results.
 */
export async function retryPageRun(pageRunId: string): Promise<void> {
  await postJson<{ ok: true }, Record<string, never>>(
    `/page-extraction/page-runs/${pageRunId}/retry`,
    {},
  );
}

/**
 * Cancel an in-flight run. Sets run + outstanding page_runs to `cancelled`.
 */
export async function cancelRun(runId: string): Promise<void> {
  await postJson<{ ok: true }, Record<string, never>>(
    `/page-extraction/runs/${runId}/cancel`,
    {},
  );
}

// ---------------------------------------------------------------------------
// Wire-format adapter
//
// Backend writes generic matrx-connect envelopes:
//   { "event": "data",       "data": { "kind": "page_extraction.run_started", ... } }
//   { "event": "data",       "data": { "kind": "page_extraction.page_run_completed", ... } }
//   { "event": "completion", "data": { ... } }
//   { "event": "error",      "data": { "message": "..." } }
//
// The hook + UI think in discriminated namespaced events.
// ---------------------------------------------------------------------------
function parseLine(line: string): ExtractionStreamEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const env = raw as { event?: string; data?: unknown };

  if (env.event === "error") {
    const d = (env.data ?? {}) as { message?: string; error_type?: string };
    return {
      event: "stream.error",
      data: { message: d.message ?? d.error_type ?? "Extraction failed" },
    };
  }

  const data = (env.data ?? {}) as { kind?: string } & Record<string, unknown>;
  const kind = data.kind;

  switch (kind) {
    case "page_extraction.run_started":
      return {
        event: "run.started",
        data: {
          run_id: String(data.run_id ?? ""),
          chunk_count: Number(data.chunk_count ?? 0),
        },
      };
    case "page_extraction.page_run_started":
      return {
        event: "page_run.started",
        data: {
          page_run_id: String(data.page_run_id ?? ""),
          chunk_index: Number(data.chunk_index ?? 0),
          page_numbers: Array.isArray(data.page_numbers)
            ? (data.page_numbers as number[])
            : [],
        },
      };
    case "page_extraction.page_run_delta":
      return {
        event: "page_run.delta",
        data: {
          page_run_id: String(data.page_run_id ?? ""),
          text: String(data.text ?? ""),
        },
      };
    case "page_extraction.page_run_completed":
      return {
        event: "page_run.completed",
        data: {
          page_run_id: String(data.page_run_id ?? ""),
          chunk_index: Number(data.chunk_index ?? 0),
          page_numbers: Array.isArray(data.page_numbers)
            ? (data.page_numbers as number[])
            : [],
          result_count: Number(data.result_count ?? 0),
          cost: Number(data.cost ?? 0),
          tokens: Number(data.tokens ?? 0),
          duration_ms: Number(data.duration_ms ?? 0),
          raw_response: typeof data.raw_response === "string" ? data.raw_response : "",
          parsed_payload: Array.isArray(data.parsed_payload)
            ? (data.parsed_payload as Record<string, unknown>[] as never)
            : null,
        },
      };
    case "page_extraction.page_run_failed":
      return {
        event: "page_run.failed",
        data: {
          page_run_id: String(data.page_run_id ?? ""),
          chunk_index: Number(data.chunk_index ?? 0),
          page_numbers: Array.isArray(data.page_numbers)
            ? (data.page_numbers as number[])
            : [],
          error: String(data.error ?? "Unknown error"),
          ...(typeof data.raw_response === "string"
            ? { raw_response: data.raw_response }
            : {}),
        },
      };
    case "page_extraction.run_completed":
      return {
        event: "run.completed",
        data: {
          run_id: String(data.run_id ?? ""),
          result_count: Number(data.result_count ?? 0),
          completed_chunks: Number(data.completed_chunks ?? 0),
          failed_chunks: Number(data.failed_chunks ?? 0),
          total_cost: Number(data.total_cost ?? 0),
          total_tokens: Number(data.total_tokens ?? 0),
        },
      };
    case "page_extraction.run_failed":
      return {
        event: "run.failed",
        data: {
          run_id: String(data.run_id ?? ""),
          error: String(data.error ?? "Run failed"),
        },
      };
    default:
      return null;
  }
}
