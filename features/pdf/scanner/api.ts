/**
 * Scanner API client — document boundary detection + one-shot scan save.
 *
 * `createScanPdf` mirrors the extractor's batch-extract consumption
 * pattern (`usePdfExtractor.extractFiles`): NDJSON stream, terminal
 * `data` event carries ids, callers navigate on `doc_id` the moment it
 * arrives.
 */

import { ENDPOINTS } from "@/lib/api/endpoints";
import { parseHttpError } from "@/lib/api/errors";
import { parseNdjsonStream } from "@/lib/api/stream-parser";
import { buildHeaders, postNdjson, resolveBaseUrl } from "@/lib/python-client";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import type { ImageDocumentDetectedData } from "@/types/python-generated/stream-events";

import type {
  DetectDocumentResponse,
  Quad,
  QuadPoint,
  ScanPdfRequest,
  ScanPdfResult,
} from "./types";

/**
 * Boundary detection for one uploaded photo. Pure read — nothing persisted.
 * `mode: "relaxed"` is the user-triggered "try again" pass (brightness
 * region + rect fallback) for shots the conservative pass gives up on.
 *
 * 2026-07 stream conversion: the endpoint now speaks NDJSON. We drain the
 * stream and resolve on the `image_document_detected` terminal event,
 * rebuilding the legacy nested-`quad` response shape so callers
 * (useScanSession) stay untouched. The server flattened the four corners
 * onto the event; we fold them back into a `Quad`.
 */
export async function detectDocument(
  fileId: string,
  mode: "standard" | "relaxed" = "standard",
): Promise<DetectDocumentResponse> {
  const organizationId = await ensureOrgId(undefined);
  let result: DetectDocumentResponse | null = null;
  for await (const evt of postNdjson("/images/detect-document", {
    source_id: fileId,
    mode,
    organization_id: organizationId,
  })) {
    if (evt.event === "error") {
      throw new Error(
        evt.data.user_message ?? evt.data.message ?? "Document detection failed.",
      );
    }
    if (evt.event !== "data") continue;
    const d = evt.data;
    if (!d || typeof d !== "object" || !("type" in d)) continue;
    // The generated data union includes UntypedDataPayload (indexed), so
    // literal narrowing alone can't pin the member — assert to the
    // generated per-event interface after checking the discriminant.
    if (d.type === "image_document_detected") {
      const p = d as ImageDocumentDetectedData;
      result = {
        found: p.found,
        quad: quadFromCorners(p),
        confidence: p.confidence ?? 0,
        image_width: p.image_width ?? 0,
        image_height: p.image_height ?? 0,
      };
    }
  }
  if (!result) {
    throw new Error(
      "The document-detection stream ended without a result event.",
    );
  }
  return result;
}

/**
 * Fold the flattened corner fields of `image_document_detected` back into
 * the nested `Quad` the scanner's coordinate contract uses. Returns null
 * when nothing was found or any corner is missing (found=false sends nulls).
 */
function quadFromCorners(p: ImageDocumentDetectedData): Quad | null {
  if (!p.found) return null;
  const corners = [p.top_left, p.top_right, p.bottom_right, p.bottom_left];
  if (corners.some((c) => !Array.isArray(c) || c.length < 2)) return null;
  const point = (c: unknown[] | null | undefined): QuadPoint => {
    const [x, y] = c as [number, number];
    return [x, y];
  };
  return {
    top_left: point(p.top_left),
    top_right: point(p.top_right),
    bottom_right: point(p.bottom_right),
    bottom_left: point(p.bottom_left),
  };
}

export interface CreateScanPdfCallbacks {
  /** Progress line from the server ("Combining 4 items…", "Extracting…"). */
  onProgress?: (message: string) => void;
  /** Extraction opened the assembled PDF — page count is known. */
  onExtractStarted?: (totalPages: number) => void;
  /** One page's raw text finished (live, in page order). */
  onPageExtracted?: (page: ScanPageExtracted) => void;
  /**
   * The scan itself is saved and extracted — ids are known. Fires WELL BEFORE
   * the promise resolves: the content-processing pipeline (clean → chunk →
   * embed → NER) keeps streaming on this same connection afterwards.
   */
  onScanReady?: (result: ScanPdfResult) => void;
  /** One content-processing event (clean/chunk/embed/NER), live. */
  onProcessing?: (event: ScanProcessingEvent) => void;
  /** The pipeline reached a terminal state on the server. */
  onProcessingSettled?: (status: "completed" | "failed") => void;
  signal?: AbortSignal;
}

export interface ScanPageExtracted {
  pageNumber: number;
  totalPages: number;
  extractionMethod: string;
  charCount: number;
  preview: string;
}

/** One page's finished AI cleanup, streamed the moment the row is durable. */
export interface ScanCleanedPage {
  pageNumber: number;
  title: string | null;
  kind: string | null;
  text: string;
  truncated: boolean;
}

/** A content-processing progress event, normalized for the scanner UI. */
export interface ScanProcessingEvent {
  stage: string; // materialize | clean | chunk | embed | ner | enrich
  phase: string; // started | progress | page | heartbeat | done | stats | error
  message: string;
  current: number;
  total: number;
  /** Present on `clean`/`page` — the model's real output for that page. */
  cleanedPage: ScanCleanedPage | null;
  /** Present on the terminal `stats` event. */
  stats: { entities: number | null; chunks: number | null } | null;
}

function parseProcessingEvent(
  d: Record<string, unknown>,
): ScanProcessingEvent | null {
  if (d.kind !== "content.processing.progress") return null;
  const data = (d.data ?? null) as Record<string, unknown> | null;
  const preview = (data?.preview ?? null) as Record<string, unknown> | null;
  const cleanedPage =
    preview && preview.kind === "page_clean" && typeof preview.cleaned_text === "string"
      ? {
          pageNumber: Number(preview.page_number ?? 0),
          title:
            typeof preview.section_title === "string" ? preview.section_title : null,
          kind: typeof preview.section_kind === "string" ? preview.section_kind : null,
          text: preview.cleaned_text,
          truncated: preview.truncated === true,
        }
      : null;
  const stats =
    d.phase === "stats" && data
      ? {
          entities: typeof data.entities === "number" ? data.entities : null,
          chunks: typeof data.chunks === "number" ? data.chunks : null,
        }
      : null;
  return {
    stage: String(d.stage ?? ""),
    phase: String(d.phase ?? ""),
    message: typeof d.message === "string" ? d.message : "",
    current: Number(d.current ?? 0),
    total: Number(d.total ?? 0),
    cleanedPage,
    stats,
  };
}

/**
 * Build + persist + extract the scan, then watch its content-processing
 * pipeline — all on ONE connection.
 *
 * 🚨 THE FLOATING LAW. This used to `break` out of the stream at the scan
 * result and let a 2s Supabase poll guess at the rest; the expensive multi-LLM
 * clean step showed a percentage while the model's rewrite of the user's own
 * scan stayed invisible until it was over. The server streams that work (it has
 * since the pipeline moved inline), and each page's cleaned text now rides the
 * stream as it lands, so the client watches instead of polling. Resolves when
 * the stream ends; ids reach the caller far earlier via `onScanReady`.
 */
export async function createScanPdf(
  payload: ScanPdfRequest,
  {
    onProgress,
    onExtractStarted,
    onPageExtracted,
    onScanReady,
    onProcessing,
    onProcessingSettled,
    signal,
  }: CreateScanPdfCallbacks = {},
): Promise<ScanPdfResult> {
  const { headers } = await buildHeaders({}, true);
  const response = await fetch(
    `${resolveBaseUrl()}${ENDPOINTS.pdf.fromImages}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal,
    },
  );
  if (!response.ok) {
    const apiError = await parseHttpError(response);
    throw new Error(apiError.userMessage);
  }

  let result: ScanPdfResult | null = null;
  const { events } = parseNdjsonStream(response, signal);
  for await (const event of events) {
    if (event.event === "info") {
      const msg = event.data.user_message ?? event.data.system_message;
      if (msg) onProgress?.(msg);
    }
    if (event.event === "record_update") {
      // The pipeline's terminal signal for this document.
      const status = event.data.status === "failed" ? "failed" : "completed";
      onProcessingSettled?.(status);
      continue;
    }
    if (event.event === "data") {
      const d = event.data as unknown as Record<string, unknown>;
      // Typed mid-stream events (per-page extraction) carry a `type`
      // discriminant; the ScanPdfResult does not (status/doc_id).
      if (d && typeof d === "object" && "type" in d) {
        if (d.type === "pdf_extract_started") {
          onExtractStarted?.(Number(d.total_pages ?? 0));
        } else if (d.type === "pdf_page_extracted") {
          onPageExtracted?.({
            pageNumber: Number(d.page_number ?? 0),
            totalPages: Number(d.total_pages ?? 0),
            extractionMethod: String(d.extraction_method ?? ""),
            charCount: Number(d.char_count ?? 0),
            preview: String(d.preview ?? ""),
          });
        }
        continue;
      }
      // Content-processing progress (clean/chunk/embed/NER) streams AFTER the
      // scan result on this same connection — including each page's finished
      // cleaned text.
      if (d && typeof d === "object" && "kind" in d) {
        const processing = parseProcessingEvent(d);
        if (processing) onProcessing?.(processing);
        else if (typeof d.message === "string") onProgress?.(d.message);
        continue;
      }
      if (d && typeof d === "object" && "status" in d) {
        result = event.data as unknown as ScanPdfResult;
        // Ids reach the caller NOW; keep draining, because everything the
        // clean step produces still has to arrive.
        if (result.status !== "error") onScanReady?.(result);
      }
    }
  }
  if (!result) {
    throw new Error("The scan stream ended without a result.");
  }
  if (result.status === "error") {
    const err = new Error(result.error || "Scan failed.") as Error & {
      fileId?: string | null;
    };
    // Surface the persisted PDF id (when assembly succeeded but extraction
    // failed) so the caller can point the user at the file — never lost.
    err.fileId = result.file_id;
    throw err;
  }
  return result;
}
