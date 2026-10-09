/**
 * PDF Extractor — canonical streaming service.
 *
 * Thin wrapper around `consumeStream` from `@/lib/api/stream-parser` (the
 * platform-wide NDJSON consumer). Four endpoints, one shape:
 *
 *   - `streamPdfClean(...)`             → POST `/utilities/pdf/clean-content/{id}`
 *   - `streamPdfFullPipeline(...)`      → POST `/utilities/pdf/full-pipeline`
 *   - `streamPdfExtractText(...)`       → POST `/utilities/pdf/extract-text` (multipart)
 *   - `streamPdfExtractTextRemote(...)` → POST `/utilities/pdf/extract-text-remote` (JSON)
 *
 * Every PDF-extractor caller (the hook, the studio shell, the mobile shell,
 * the floating workspace) goes through these two functions. The previous
 * code inlined NDJSON parsing in four places — see the plan at
 * `~/.claude/plans/we-need-to-get-snappy-anchor.md` for why.
 *
 * **Event handling.** The Python backend (aidream) emits the standard Matrx
 * stream contract — `chunk`, `info`, `data`, `record_reserved`,
 * `record_update`, `completion`, `error`, `end`. We surface the events the
 * callers actually need via narrow callbacks; the rest are silently
 * consumed by `consumeStream`.
 *
 * **What's actually emitted today.**
 *
 *   /pdf/clean-content/{id} — agent-based whole-document clean:
 *     1. `record_reserved` (table=processed_documents, record_id=id) — the
 *        server's "I'm about to modify this row" signal.
 *     2. `data` carrying `{ doc_id, clean_content, usage }` (CleanContentResult).
 *     3. `record_update` (table=processed_documents, record_id=id) — the
 *        "row is now updated" signal that mirrors what cx_message / cx_request
 *        emit. Authoritative "refetch me" trigger.
 *     4. `end`.
 *
 *   /pdf/full-pipeline — extract + optional template-based AI pass. Creates
 *   a NEW child `processed_documents` row + per-page rows on the child.
 *     1. `info` events with `user_message` — progress strings.
 *     2. `data` carrying the legacy PdfResult dump. After persistence runs the
 *        new child row id is stamped on `result.file_id`. (No `record_update`
 *        on this endpoint today — the dump itself carries the new id.)
 *     3. `end`.
 *
 *   /pdf/extract-text (multipart) + /pdf/extract-text-remote (JSON) — pure
 *   per-page text extraction, converted from blocking JSON 2026-07:
 *     1. `data` `pdf_extract_started` — `{ filename, total_pages }`.
 *     2. `data` `pdf_page_extracted` per page — `{ page_number, total_pages,
 *        extraction_method: "native"|"ocr", char_count, preview }` (preview
 *        capped ~400 chars server-side).
 *     3. `data` `pdf_extract_complete` — the old blocking response body
 *        (`text_content`, `file_id`, counts). Treat it as THE result.
 *     4. `end`.
 *
 * NOTE: this service does NOT do DB refetches itself — the hook owns that so
 * the `invalidateProcessedDocumentCache` + `fetchDocument` finalize stays in
 * one place. We just return the typed signals.
 */

import { consumeStream } from "@/lib/api/stream-parser";
import type {
  CompletionPayload,
  InfoPayload,
  RecordUpdatePayload,
} from "@/lib/api/types";
import type {
  PdfExtractCompleteData,
  PdfExtractStartedData,
  PdfPageExtractedData,
} from "@ai-matrx/agents/generated/stream-events";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { requestRaw } from "@/lib/python-client";
import { recordRunStatus } from "./cleanOutcome";

// ─── Shared helpers ──────────────────────────────────────────────────────────

function extractProgressMessage(data: InfoPayload): string | null {
  if (data.user_message && data.user_message.length > 0)
    return data.user_message;
  if (data.system_message && data.system_message.length > 0) {
    return data.system_message;
  }
  return null;
}

function extractCompletionText(data: CompletionPayload): string | null {
  // Agent runs in newer endpoints put the final string in `result.output`.
  const out = data.result?.output;
  if (typeof out === "string" && out.length > 0) return out;
  return null;
}

/**
 * Caller-supplied transport fields kept for signature compatibility. The host
 * door (`requestRaw`) resolves the active server and stamps Authorization +
 * X-Organization-Id itself, so both are ignored.
 */
interface LegacyTransportFields {
  /** @deprecated Ignored — the host door resolves the server. */
  baseUrl?: string | null;
  /** @deprecated Ignored — the host door adds auth + organization headers. */
  headers?: Record<string, string>;
}

/**
 * Thrown when the caller's signal aborted the stream. The shared parser ends
 * an aborted stream QUIETLY (it returns, never throws), so without this a
 * stalled-then-aborted run looked like a clean finish with no content.
 */
export class StreamAbortedError extends Error {
  constructor() {
    super("Stream aborted");
    this.name = "StreamAbortedError";
  }
}

// ─── /pdf/clean-content/{id} ─────────────────────────────────────────────────

export interface StreamPdfCleanCallbacks {
  /**
   * Fires for EVERY event the server sends — heartbeat, record_reserved and
   * anything else included. Callers reset their stall watchdog here.
   */
  onActivity?: () => void;
  /** Fires for every `info` event with a `user_message` / `message` string. */
  onProgress?: (message: string) => void;
  /**
   * Fires when a `chunk` event arrives (token streaming). Receives the
   * full accumulated text so far so the consumer can render a single
   * growing block without re-accumulating.
   *
   * Today's clean-content endpoint emits a single `data` event with the
   * final string rather than tokens, so this won't fire for that path —
   * kept on the interface so any future server-side change to stream
   * tokens lights up automatically.
   */
  onTextDelta?: (accumulated: string) => void;
  /** Fires on the `data` event with the cleaned markdown payload. */
  onCleanContent?: (text: string) => void;
  /** Server's "row changed, refetch me" signal, with its status. */
  onRecordUpdate?: (recordId: string, status: string | null) => void;
  /**
   * Fires when the server announces the run mode via the initial
   * `pdf_clean_started` data event. `mode === "per_page"` means the run is
   * RESUMABLE: every cleaned page persists server-side the moment it
   * finishes, so re-invoking the endpoint after a dropped connection only
   * pays for the pages that never completed. Callers use this to auto-retry
   * per-page runs instead of surfacing a fatal error.
   */
  onCleanStarted?: (info: { mode: string; totalPages: number | null }) => void;
  /**
   * The server's `X-Request-ID` for this run, the moment the response opens —
   * the id a refreshed page reconnects to (`usePdfDocRun`).
   */
  onRequestId?: (requestId: string) => void;
}

export interface StreamPdfCleanResult {
  /** Cleaned text — from `data.clean_content`, or `completion.data.output` as fallback. */
  cleanContent: string | null;
  /** Whatever arrived via chunk events. Empty for the current server. */
  accumulatedText: string;
  /** True if the server emitted a `record_update` for this doc. */
  serverConfirmedUpdate: boolean;
  /** `status` of the last `record_update` for this doc, if any. */
  recordStatus: string | null;
}

export async function streamPdfClean(opts: {
  docId: string;
  callbacks?: StreamPdfCleanCallbacks;
  signal?: AbortSignal;
} & LegacyTransportFields): Promise<StreamPdfCleanResult> {
  const { docId, callbacks = {}, signal } = opts;

  // Non-2xx throws a classified BackendApiError (read with getUserMessage).
  const response = await requestRaw(
    ENDPOINTS.pdf.cleanContent(docId),
    { method: "POST" },
    { signal },
  );
  const requestId = response.headers.get("X-Request-ID");
  if (requestId) callbacks.onRequestId?.(requestId);

  let cleanContent: string | null = null;
  let serverConfirmedUpdate = false;
  let recordStatus: string | null = null;
  let firstErrorMessage: string | null = null;
  // Local accumulator so we can fire `onTextDelta` with the running total
  // on every chunk, not just at the end. `consumeStream` exposes the
  // accumulated text only via its return value, which is too late.
  let chunkAccumulator = "";

  const { accumulatedText } = await consumeStream(
    response,
    {
      onEvent: () => callbacks.onActivity?.(),
      onChunk: (data) => {
        if (typeof data.text === "string" && data.text.length > 0) {
          chunkAccumulator += data.text;
          callbacks.onTextDelta?.(chunkAccumulator);
        }
      },
      // Reasoning status — surface "Reasoning…" so a thinking model doesn't look
      // stuck on the generic progress label the whole time.
      onReasoning: (data) => {
        if (data.state === "started") callbacks.onProgress?.("Reasoning…");
      },
      onInfo: (data) => {
        const msg = extractProgressMessage(data);
        if (msg) callbacks.onProgress?.(msg);
      },
      onData: (data) => {
        if (!data || typeof data !== "object") return;
        const record = data as Record<string, unknown>;
        if (record.type === "pdf_clean_started") {
          callbacks.onCleanStarted?.({
            mode: typeof record.mode === "string" ? record.mode : "whole_doc",
            totalPages:
              typeof record.total_pages === "number"
                ? record.total_pages
                : null,
          });
          return;
        }
        const candidate = record.clean_content;
        if (typeof candidate === "string" && candidate.length > 0) {
          cleanContent = candidate;
          callbacks.onCleanContent?.(candidate);
        }
      },
      onRecordUpdate: (data: RecordUpdatePayload) => {
        if (data.table === "processed_documents" && data.record_id === docId) {
          serverConfirmedUpdate = true;
          // A batch-parked clean arrives as status "active" with
          // metadata.run_status "awaiting_batch"; surface it as one status.
          recordStatus =
            recordRunStatus(data.metadata) === "awaiting_batch"
              ? "awaiting_batch"
              : typeof data.status === "string"
                ? data.status
                : null;
          callbacks.onRecordUpdate?.(data.record_id, recordStatus);
        }
      },
      onCompletion: (data) => {
        // If the stream ended without an inline `clean_content` but the
        // completion carries the final text, treat that as the result.
        if (cleanContent == null) {
          const text = extractCompletionText(data);
          if (text) {
            cleanContent = text;
            callbacks.onCleanContent?.(text);
          }
        }
      },
      onError: (data) => {
        firstErrorMessage =
          data.user_message ??
          data.message ??
          "AI cleanup stream emitted an error";
      },
    },
    signal,
  );

  if (firstErrorMessage) throw new Error(firstErrorMessage);
  if (signal?.aborted) throw new StreamAbortedError();

  return { cleanContent, accumulatedText, serverConfirmedUpdate, recordStatus };
}

// ─── /pdf/full-pipeline ──────────────────────────────────────────────────────

export interface PdfFullPipelineBody {
  /**
   * Canonical MediaRef source — exactly one of `file_id` / `url` inside
   * `media`. Build it with `buildPdfSource` from
   * `@/features/pdf/utils/source`; never hand-roll (the old `{ cld_id }`
   * shape was silently dropped by the backend and 422'd every cloud doc).
   */
  media?: { file_id: string } | { url: string };
  /** Legacy top-level URL — still accepted, prefer `media`. */
  url?: string;
  /** Mirrors `PdfPipelineOptions` on the Python side. */
  options?: {
    include_page_metadata?: boolean;
    include_block_metadata?: boolean;
    include_word_metadata?: boolean;
    include_chunk_metadata?: boolean;
    chunk_and_process_with_ai?: boolean;
    template_name?: string;
    /** OCR override lives INSIDE options — the server reads `options.force_ocr`. */
    force_ocr?: boolean;
  };
}

export interface StreamPdfFullPipelineCallbacks {
  /** Fires for EVERY event (heartbeat included) — reset the stall watchdog. */
  onActivity?: () => void;
  onProgress?: (message: string) => void;
  onTextDelta?: (accumulated: string) => void;
  /**
   * Fires when the stream's `data` event reveals the new (child)
   * `processed_documents` row id. The Python server stamps it on
   * `result.file_id` in the PdfResult dump.
   */
  onChildDocId?: (childId: string) => void;
  onRecordUpdate?: (recordId: string) => void;
}

export interface StreamPdfFullPipelineResult {
  /** New child `processed_documents.id`, or `null` if the server didn't return one. */
  childDocId: string | null;
  accumulatedText: string;
}

export async function streamPdfFullPipeline(opts: {
  body: PdfFullPipelineBody;
  callbacks?: StreamPdfFullPipelineCallbacks;
  signal?: AbortSignal;
} & LegacyTransportFields): Promise<StreamPdfFullPipelineResult> {
  const { body, callbacks = {}, signal } = opts;

  const response = await requestRaw(
    ENDPOINTS.pdf.fullPipeline,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { signal },
  );

  let childDocId: string | null = null;
  let firstErrorMessage: string | null = null;
  let chunkAccumulator = "";

  const { accumulatedText } = await consumeStream(
    response,
    {
      onEvent: () => callbacks.onActivity?.(),
      onChunk: (data) => {
        if (typeof data.text === "string" && data.text.length > 0) {
          chunkAccumulator += data.text;
          callbacks.onTextDelta?.(chunkAccumulator);
        }
      },
      onReasoning: (data) => {
        if (data.state === "started") callbacks.onProgress?.("Reasoning…");
      },
      onInfo: (data) => {
        const msg = extractProgressMessage(data);
        if (msg) callbacks.onProgress?.(msg);
      },
      onData: (data) => {
        // The legacy PdfResult dump carries `file_id` (the new child doc id).
        // Some older variants used `doc_id` or `processed_document_id` —
        // tolerate all three.
        if (!data || typeof data !== "object") return;
        const obj = data as Record<string, unknown>;
        const id =
          (obj.file_id as string | undefined) ??
          (obj.doc_id as string | undefined) ??
          (obj.processed_document_id as string | undefined);
        if (typeof id === "string" && id.length > 0 && childDocId == null) {
          childDocId = id;
          callbacks.onChildDocId?.(id);
        }
      },
      onRecordUpdate: (data: RecordUpdatePayload) => {
        if (data.table === "processed_documents") {
          callbacks.onRecordUpdate?.(data.record_id);
        }
      },
      onError: (data) => {
        firstErrorMessage =
          data.user_message ??
          data.message ??
          "PDF pipeline stream emitted an error";
      },
    },
    signal,
  );

  if (firstErrorMessage) throw new Error(firstErrorMessage);
  if (signal?.aborted) throw new StreamAbortedError();

  return { childDocId, accumulatedText };
}

// ─── /pdf/extract-text + /pdf/extract-text-remote ────────────────────────────

export interface StreamPdfExtractTextCallbacks {
  /** Fires for every `info` event with a `user_message` / `system_message`. */
  onProgress?: (message: string) => void;
  /** Fires on `pdf_extract_started` — filename + total page count. */
  onStarted?: (data: PdfExtractStartedData) => void;
  /**
   * Fires on every `pdf_page_extracted` — page N / M, native-vs-OCR method,
   * char count, and a ~400-char preview of the page text.
   */
  onPageExtracted?: (data: PdfPageExtractedData) => void;
}

/**
 * Shared consumer for both extract-text streams. Resolves with the terminal
 * `pdf_extract_complete` payload — the exact body the old blocking JSON
 * response carried (`text_content`, `file_id`, counts). Throws on a stream
 * `error` event or a stream that ends without a complete event.
 */
async function consumePdfExtractTextStream(
  response: Response,
  callbacks: StreamPdfExtractTextCallbacks,
  signal?: AbortSignal,
): Promise<PdfExtractCompleteData> {
  let complete: PdfExtractCompleteData | null = null;
  let firstErrorMessage: string | null = null;

  await consumeStream(
    response,
    {
      onInfo: (data) => {
        const msg = extractProgressMessage(data);
        if (msg) callbacks.onProgress?.(msg);
      },
      onData: (data) => {
        if (!data || typeof data !== "object") return;
        const type = (data as { type?: string }).type;
        if (type === "pdf_extract_started") {
          callbacks.onStarted?.(data as PdfExtractStartedData);
        } else if (type === "pdf_page_extracted") {
          callbacks.onPageExtracted?.(data as PdfPageExtractedData);
        } else if (type === "pdf_extract_complete") {
          complete = data as PdfExtractCompleteData;
        }
      },
      onError: (data) => {
        firstErrorMessage =
          data.user_message ??
          data.message ??
          "PDF extraction stream emitted an error";
      },
    },
    signal,
  );

  if (firstErrorMessage) throw new Error(firstErrorMessage);
  if (!complete) {
    throw new Error(
      "PDF extraction stream ended without a pdf_extract_complete event",
    );
  }
  return complete;
}

/**
 * POST `/utilities/pdf/extract-text` — multipart upload (PDF or image).
 * No Content-Type is set: the browser sets the multipart boundary.
 */
export async function streamPdfExtractText(opts: {
  file: File;
  callbacks?: StreamPdfExtractTextCallbacks;
  signal?: AbortSignal;
} & LegacyTransportFields): Promise<PdfExtractCompleteData> {
  const { file, callbacks = {}, signal } = opts;

  const formData = new FormData();
  formData.append("file", file);

  const response = await requestRaw(
    ENDPOINTS.pdf.extractText,
    { method: "POST", body: formData },
    { signal },
  );

  return consumePdfExtractTextStream(response, callbacks, signal);
}

/** Mirrors `ExtractTextRequest` on the Python side (SourceMixin + knobs). */
export interface PdfExtractTextRemoteBody {
  /** Canonical MediaRef source — build with `buildPdfSource`. */
  media?: { file_id: string } | { url: string };
  /** Legacy top-level URL — still accepted, prefer `media`. */
  url?: string;
  force_ocr?: boolean;
  use_ocr_threshold?: number;
  include_page_markers?: boolean;
  include_page_metadata?: boolean;
  include_block_metadata?: boolean;
  include_word_metadata?: boolean;
  persist?: boolean;
  document_name?: string | null;
}

/** POST `/utilities/pdf/extract-text-remote` — JSON body (MediaRef / url). */
export async function streamPdfExtractTextRemote(opts: {
  body: PdfExtractTextRemoteBody;
  callbacks?: StreamPdfExtractTextCallbacks;
  signal?: AbortSignal;
} & LegacyTransportFields): Promise<PdfExtractCompleteData> {
  const { body, callbacks = {}, signal } = opts;

  const response = await requestRaw(
    ENDPOINTS.pdf.extractTextRemote,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { signal },
  );

  return consumePdfExtractTextStream(response, callbacks, signal);
}
