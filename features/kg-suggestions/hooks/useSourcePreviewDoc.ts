// features/kg-suggestions/hooks/useSourcePreviewDoc.ts
//
// Loads the full previewable SOURCE document for a `(kind, id)` on demand (when
// the user opens a source preview). A module-level promise cache keyed by
// `kind:id` dedupes concurrent/repeat loads, so re-opening the same source — or
// previewing it from two surfaces — never re-fetches the body. Mirrors the
// per-card enrichment hook's caching shape.

"use client";

import { useRead } from "@/components/read-state/useRead";
import {
  loadSourcePreview,
  type SourcePreviewDoc,
} from "@/features/kg-suggestions/service/sourcePreviewService";

const cache = new Map<string, Promise<SourcePreviewDoc>>();

function keyOf(kind: string, id: string): string {
  return `${kind}:${id}`;
}

function getDoc(kind: string, id: string): Promise<SourcePreviewDoc> {
  const key = keyOf(kind, id);
  const existing = cache.get(key);
  if (existing) return existing;
  const p = loadSourcePreview(kind, id);
  cache.set(key, p);
  // A failed read rejects: drop it so a retry (or a later open) reads again.
  p.catch(() => cache.delete(key));
  return p;
}

export interface UseSourcePreviewDocResult {
  doc: SourcePreviewDoc | null;
  loading: boolean;
  /** The read failed (not "not found") — say so instead of the empty preview. */
  error: unknown;
  /** Read the source again after a failure. */
  retry: () => void;
}

export function useSourcePreviewDoc(
  kind: string,
  id: string,
): UseSourcePreviewDocResult {
  const read = useRead(() => getDoc(kind, id), [kind, id]);
  return {
    // Only the current source's answer — never the previous source's body
    // while the next one loads.
    doc: read.status === "ready" ? (read.data ?? null) : null,
    loading: read.isLoading,
    error: read.error,
    retry: read.retry,
  };
}
