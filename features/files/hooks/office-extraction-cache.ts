/**
 * features/files/hooks/office-extraction-cache.ts
 *
 * Module-level cache of server-side Office extractions (docx/pptx → markdown),
 * keyed by fileId — the OfficePreview analogue of `blob-cache.ts`. Lives
 * OUTSIDE the lazy previewer chunk so the Redux thunks and the realtime
 * middleware can invalidate it (new version upload / restore / delete)
 * without importing the react-markdown previewer graph.
 *
 * Payloads are small (markdown text), so a simple insertion-capped Map is
 * enough — no LRU, no byte accounting.
 */

import {
  extractOfficeMarkdown,
  type OfficeExtraction,
} from "@/features/files/api/office";

const extractionCache = new Map<string, OfficeExtraction>();
const CACHE_MAX_ENTRIES = 40;
const inflight = new Map<string, Promise<OfficeExtraction>>();

/** Cached-or-fetched extraction, deduplicated across simultaneous mounts. */
export function getOfficeExtraction(fileId: string): Promise<OfficeExtraction> {
  const cached = extractionCache.get(fileId);
  if (cached) return Promise.resolve(cached);
  let p = inflight.get(fileId);
  if (!p) {
    p = extractOfficeMarkdown(fileId).then((result) => {
      if (extractionCache.size >= CACHE_MAX_ENTRIES) {
        const oldest = extractionCache.keys().next().value;
        if (oldest !== undefined) extractionCache.delete(oldest);
      }
      extractionCache.set(fileId, result);
      return result;
    });
    inflight.set(fileId, p);
    // Cleanup must not create an unhandled rejection when the fetch fails —
    // subscribers handle `p`'s rejection themselves; this chain swallows it.
    void p
      .catch(() => undefined)
      .finally(() => {
        if (inflight.get(fileId) === p) inflight.delete(fileId);
      });
  }
  return p;
}

/** Synchronous cache peek — lets the previewer render instantly on remount. */
export function peekOfficeExtraction(fileId: string): OfficeExtraction | null {
  return extractionCache.get(fileId) ?? null;
}

/** Drop the cached extraction — call wherever the blob cache is invalidated
 *  (new version uploaded, version restored, file deleted, realtime update). */
export function invalidateOfficeExtraction(fileId: string): void {
  extractionCache.delete(fileId);
}
