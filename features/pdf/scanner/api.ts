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
  signal?: AbortSignal;
}

export interface ScanPageExtracted {
  pageNumber: number;
  totalPages: number;
  extractionMethod: string;
  charCount: number;
  preview: string;
}

/**
 * Build + persist + extract the scan in one round trip. Resolves with the
 * terminal result (file_id / doc_id) or throws with the server's error.
 */
export async function createScanPdf(
  payload: ScanPdfRequest,
  {
    onProgress,
    onExtractStarted,
    onPageExtracted,
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
    if (event.event === "data") {
      const d = event.data as unknown as Record<string, unknown>;
      // Typed mid-stream events (per-page extraction) carry a `type`
      // discriminant; the terminal ScanPdfResult does not (status/doc_id).
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
      // Content-processing progress (clean/chunk/embed/NER, `kind`
      // discriminant) streams AFTER the scan result — never the result.
      if (d && typeof d === "object" && "kind" in d) {
        const msg = typeof d.message === "string" ? d.message : null;
        if (msg) onProgress?.(msg);
        continue;
      }
      if (d && typeof d === "object" && "status" in d) {
        result = event.data as unknown as ScanPdfResult;
        // Resolve the scan NOW — the server keeps streaming pipeline
        // progress for ~30s+, and it finishes that work even after we
        // stop reading (streams detach on disconnect, never cancel).
        break;
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
