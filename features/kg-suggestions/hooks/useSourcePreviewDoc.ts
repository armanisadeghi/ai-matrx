// features/kg-suggestions/hooks/useSourcePreviewDoc.ts
//
// Loads the full previewable SOURCE document for a `(kind, id)` on demand (when
// the user opens a source preview). A module-level promise cache keyed by
// `kind:id` dedupes concurrent/repeat loads, so re-opening the same source — or
// previewing it from two surfaces — never re-fetches the body. Mirrors the
// per-card enrichment hook's caching shape.

"use client";

import { useEffect, useRef, useState } from "react";
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
  // `loadSourcePreview` never rejects, but stay safe: drop on failure so a
  // later open can retry.
  p.catch(() => cache.delete(key));
  return p;
}

export interface UseSourcePreviewDocResult {
  doc: SourcePreviewDoc | null;
  loading: boolean;
}

export function useSourcePreviewDoc(
  kind: string,
  id: string,
): UseSourcePreviewDocResult {
  const [doc, setDoc] = useState<SourcePreviewDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const keyRef = useRef(keyOf(kind, id));

  useEffect(() => {
    let active = true;
    const key = keyOf(kind, id);
    keyRef.current = key;
    setLoading(true);
    setDoc(null);
    getDoc(kind, id)
      .then((res) => {
        if (active && keyRef.current === key) {
          setDoc(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active && keyRef.current === key) {
          setDoc(null);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [kind, id]);

  return { doc, loading };
}
