/**
 * PDF Extractor — canonical streaming service.
 *
 * Thin wrapper around `consumeStream` from `@/lib/api/stream-parser` (the
 * platform-wide NDJSON consumer). Two endpoints, one shape:
 *
 *   - `streamPdfClean(...)`        → POST `/utilities/pdf/clean-content/{id}`
 *   - `streamPdfFullPipeline(...)` → POST `/utilities/pdf/full-pipeline`
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
import { ENDPOINTS } from "@/lib/api/endpoints";

// ─── Shared helpers ──────────────────────────────────────────────────────────

function extractProgressMessage(data: InfoPayload): string | null {
  if (data.user_message && data.user_message.length > 0) return data.user_message;
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

async function throwOnNotOk(response: Response, label: string): Promise<void> {
  if (response.ok) return;
  const errText = await response.text().catch(() => "");
  throw new Error(
    `${label}: HTTP ${response.status}${errText ? `: ${errText.slice(0, 200)}` : ""}`,
  );
}

// ─── /pdf/clean-content/{id} ─────────────────────────────────────────────────

export interface StreamPdfCleanCallbacks {
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
  /** Server's "row changed, refetch me" signal. */
  onRecordUpdate?: (recordId: string) => void;
}

export interface StreamPdfCleanResult {
  /** Cleaned text — from `data.clean_content`, or `completion.data.output` as fallback. */
  cleanContent: string | null;
  /** Whatever arrived via chunk events. Empty for the current server. */
  accumulatedText: string;
  /** True if the server emitted a `record_update` for this doc. */
  serverConfirmedUpdate: boolean;
}

export async function streamPdfClean(opts: {
  docId: string;
  baseUrl: string;
  headers: Record<string, string>;
  callbacks?: StreamPdfCleanCallbacks;
  signal?: AbortSignal;
}): Promise<StreamPdfCleanResult> {
  const { docId, baseUrl, headers, callbacks = {}, signal } = opts;

  const response = await fetch(
    `${baseUrl}${ENDPOINTS.pdf.cleanContent(docId)}`,
    { method: "POST", headers, signal },
  );
  await throwOnNotOk(response, "AI cleanup failed");

  let cleanContent: string | null = null;
  let serverConfirmedUpdate = false;
  let firstErrorMessage: string | null = null;
  // Local accumulator so we can fire `onTextDelta` with the running total
  // on every chunk, not just at the end. `consumeStream` exposes the
  // accumulated text only via its return value, which is too late.
  let chunkAccumulator = "";

  const { accumulatedText } = await consumeStream(
    response,
    {
      onChunk: (data) => {
        if (typeof data.text === "string" && data.text.length > 0) {
          chunkAccumulator += data.text;
          callbacks.onTextDelta?.(chunkAccumulator);
        }
      },
      onInfo: (data) => {
        const msg = extractProgressMessage(data);
        if (msg) callbacks.onProgress?.(msg);
      },
      onData: (data) => {
        if (!data || typeof data !== "object") return;
        const candidate = (data as Record<string, unknown>).clean_content;
        if (typeof candidate === "string" && candidate.length > 0) {
          cleanContent = candidate;
          callbacks.onCleanContent?.(candidate);
        }
      },
      onRecordUpdate: (data: RecordUpdatePayload) => {
        if (data.table === "processed_documents" && data.record_id === docId) {
          serverConfirmedUpdate = true;
          callbacks.onRecordUpdate?.(data.record_id);
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
          data.user_message ?? data.message ?? "AI cleanup stream emitted an error";
      },
    },
    signal,
  );

  if (firstErrorMessage) throw new Error(firstErrorMessage);

  return { cleanContent, accumulatedText, serverConfirmedUpdate };
}

// ─── /pdf/full-pipeline ──────────────────────────────────────────────────────

export interface PdfFullPipelineBody {
  /**
   * Canonical MediaRef source — exactly one of `file_id` / `url` / `file_uri`
   * inside `media`. Build it with `buildPdfSource` from
   * `@/features/pdf/utils/source`; never hand-roll (the old `{ cld_id }`
   * shape was silently dropped by the backend and 422'd every cloud doc).
   */
  media?: { file_id: string } | { url: string } | { file_uri: string };
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
  baseUrl: string;
  headers: Record<string, string>;
  callbacks?: StreamPdfFullPipelineCallbacks;
  signal?: AbortSignal;
}): Promise<StreamPdfFullPipelineResult> {
  const { body, baseUrl, headers, callbacks = {}, signal } = opts;

  const response = await fetch(`${baseUrl}${ENDPOINTS.pdf.fullPipeline}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  await throwOnNotOk(response, "PDF pipeline failed");

  let childDocId: string | null = null;
  let firstErrorMessage: string | null = null;
  let chunkAccumulator = "";

  const { accumulatedText } = await consumeStream(
    response,
    {
      onChunk: (data) => {
        if (typeof data.text === "string" && data.text.length > 0) {
          chunkAccumulator += data.text;
          callbacks.onTextDelta?.(chunkAccumulator);
        }
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
          data.user_message ?? data.message ?? "PDF pipeline stream emitted an error";
      },
    },
    signal,
  );

  if (firstErrorMessage) throw new Error(firstErrorMessage);

  return { childDocId, accumulatedText };
}
