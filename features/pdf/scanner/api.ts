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
import { buildHeaders, postJson, resolveBaseUrl } from "@/lib/python-client";

import type {
  DetectDocumentResponse,
  ScanPdfRequest,
  ScanPdfResult,
} from "./types";

/** Boundary detection for one uploaded photo. Pure read — nothing persisted. */
export async function detectDocument(
  fileId: string,
): Promise<DetectDocumentResponse> {
  const { data } = await postJson<
    DetectDocumentResponse,
    { source_id: string }
  >("/images/detect-document", { source_id: fileId });
  return data;
}

export interface CreateScanPdfCallbacks {
  /** Progress line from the server ("Combining 4 items…", "Extracting…"). */
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
}

/**
 * Build + persist + extract the scan in one round trip. Resolves with the
 * terminal result (file_id / doc_id) or throws with the server's error.
 */
export async function createScanPdf(
  payload: ScanPdfRequest,
  { onProgress, signal }: CreateScanPdfCallbacks = {},
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
      result = event.data as unknown as ScanPdfResult;
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
