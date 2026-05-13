/**
 * features/rag/api/stages.ts
 *
 * Streaming client for the per-stage RAG actions:
 *   POST /rag/library/{id}/extract
 *   POST /rag/library/{id}/clean
 *   POST /rag/library/{id}/chunk
 *   POST /rag/library/{id}/embed
 *   POST /rag/library/{id}/run-all
 *   GET  /rag/library/{id}/stages
 *
 * The backend emits matrx-connect-shaped wire events:
 *   {"event": "data", "data": {"kind": "rag.stage.progress", ...}}
 *   {"event": "data", "data": {"kind": "rag.stage.result",   "stage": "...", ...}}
 *   {"event": "completion", "data": {}}
 *   {"event": "error", "data": {"message": "..."}}
 *
 * This module flattens that into a typed stream the UI can render.
 */

import {
  buildHeaders,
  getJson,
  resolveBaseUrl,
} from "@/lib/python-client";

export type StageName = "extract" | "clean" | "chunk" | "embed" | "run_all";

export type StagePillName =
  | "cloud_file"
  | "raw_text"
  | "clean_text"
  | "chunks"
  | "vectors"
  | "stores";

export type StagePhase =
  | "started"
  | "progress"
  | "heartbeat"
  | "done"
  | "error";

export interface StageProgressEvent {
  event: "stage.progress";
  data: {
    stage: StageName;
    phase: StagePhase;
    message: string;
    current: number;
    total: number;
    extra: Record<string, unknown>;
  };
}

export interface StageResultEvent {
  event: "stage.result";
  data: {
    stage: StageName;
    ok: boolean;
    [k: string]: unknown;
  };
}

export interface StageErrorEvent {
  event: "stage.error";
  data: { message: string };
}

export interface StageEndEvent {
  event: "stage.end";
  data: Record<string, unknown>;
}

export type StageStreamEvent =
  | StageProgressEvent
  | StageResultEvent
  | StageErrorEvent
  | StageEndEvent;

export interface StageStatus {
  stage: StagePillName;
  state: "done" | "partial" | "missing";
  current: number;
  total: number;
  detail: string | null;
}

export interface StagesStatusResponse {
  processed_document_id: string;
  cld_file_id: string | null;
  stages: StageStatus[];
}

// ---------------------------------------------------------------------------
// Status endpoint
// ---------------------------------------------------------------------------

export async function fetchStagesStatus(
  processedDocumentId: string,
  signal?: AbortSignal,
): Promise<StagesStatusResponse> {
  const { data } = await getJson<StagesStatusResponse>(
    `/rag/library/${encodeURIComponent(processedDocumentId)}/stages`,
    { signal },
  );
  return data;
}

// ---------------------------------------------------------------------------
// Streaming runner
// ---------------------------------------------------------------------------

export async function* runStageStream(
  processedDocumentId: string,
  stage: StageName,
  opts: { signal?: AbortSignal } = {},
): AsyncGenerator<StageStreamEvent, void, void> {
  const path = stage === "run_all" ? `run-all` : stage; // extract | clean | chunk | embed
  const url = `${resolveBaseUrl()}/rag/library/${encodeURIComponent(processedDocumentId)}/${path}`;

  const { headers } = await buildHeaders({ signal: opts.signal }, true);
  const response = await fetch(url, {
    method: "POST",
    headers,
    signal: opts.signal,
  });
  if (!response.ok || !response.body) {
    yield {
      event: "stage.error",
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
          const ev = parseLine(line);
          if (ev) yield ev;
        }
        nl = buffer.indexOf("\n");
      }
    }
    if (buffer.trim().length > 0) {
      const ev = parseLine(buffer);
      if (ev) yield ev;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseLine(line: string): StageStreamEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;

  const env = raw as { event?: string; data?: Record<string, unknown> };
  const evName = typeof env.event === "string" ? env.event : "";
  const data = (env.data ?? {}) as Record<string, unknown>;

  if (evName === "data") {
    const kind = typeof data.kind === "string" ? data.kind : "";
    if (kind === "rag.stage.progress") {
      return {
        event: "stage.progress",
        data: {
          stage: (data.stage as StageName) ?? "extract",
          phase: (data.phase as StagePhase) ?? "progress",
          message: typeof data.message === "string" ? data.message : "",
          current: typeof data.current === "number" ? data.current : 0,
          total: typeof data.total === "number" ? data.total : 0,
          extra: (data.extra as Record<string, unknown>) ?? {},
        },
      };
    }
    if (kind === "rag.stage.result") {
      return { event: "stage.result", data: data as StageResultEvent["data"] };
    }
    return null;
  }
  if (evName === "completion") {
    return { event: "stage.end", data };
  }
  if (evName === "error") {
    return {
      event: "stage.error",
      data: {
        message:
          typeof data.message === "string" ? data.message : "Stream error",
      },
    };
  }
  return null;
}
