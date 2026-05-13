"use client";

/**
 * features/files/hooks/usePdfRemoteSource.ts
 *
 * Resolve a cloud-files PDF (by `fileId`) to a `{ remoteUrl, headers }`
 * pair that `<PdfDocumentRenderer/>` can hand to pdfjs for progressive
 * Range-based rendering.
 *
 * Why a dedicated hook (vs reusing `useFileBlob`)
 * ───────────────────────────────────────────────
 * `useFileBlob` pre-fetches the entire file and returns a `blob:` URL.
 * That defeats pdfjs's native Range / progressive support — the first
 * page can't paint until the whole document has downloaded, which can
 * be many MB. Range mode lets pdfjs request the cross-reference table
 * and the first page's bytes; the rest stream in as the user scrolls.
 *
 * The blob-cache Service Worker (`public/blob-sw.js`) intercepts
 * `/files/{id}/download` fetches and serves 206 Partial Content from
 * IndexedDB when the file is already cached — so the progressive path
 * works for both warm and cold caches:
 *   - **Cold**  → pdfjs Range fetch → backend → 206 → render that page.
 *   - **Warm**  → pdfjs Range fetch → SW intercepts → 206 from IDB
 *                 (no network at all).
 *
 * The hook itself is tiny — just resolve the Python URL + grab the
 * current Supabase access token. No state machine, no fetch, no
 * Object URL ownership. The browser's HTTP cache and the SW cache
 * handle persistence.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { pythonFileInlineUrl } from "@/features/files/handler/utils/python-base";

export interface UsePdfRemoteSourceResult {
  /** Backend URL pdfjs should range-fetch. `null` while session is loading. */
  remoteUrl: string | null;
  /** Headers to apply to every byte fetch (Authorization, Accept). */
  headers: Record<string, string>;
  /** True until the session is read at least once. */
  loading: boolean;
  /** Last error from session lookup (rare — only logged). */
  error: string | null;
}

export function usePdfRemoteSource(
  fileId: string | null,
): UsePdfRemoteSourceResult {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!fileId);
  const [error, setError] = useState<string | null>(null);

  // Read the access token once on mount (and again whenever the active
  // session changes — `onAuthStateChange` fires for sign-in / sign-out /
  // token refresh). pdfjs will reuse the same token for every Range
  // request inside a single document load; if the token expires
  // mid-render, the next Range fetch returns 401 and pdfjs surfaces a
  // load error which the renderer turns into an error card. The user
  // refreshing or re-opening the file picks up the fresh token.
  useEffect(() => {
    if (!fileId) {
      setToken(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    void supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (cancelled) return;
        if (sessionError) setError(sessionError.message);
        setToken(data.session?.access_token ?? null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Session lookup failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setToken(session?.access_token ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [fileId]);

  if (!fileId) {
    return { remoteUrl: null, headers: {}, loading: false, error: null };
  }

  const headers: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  return {
    remoteUrl: pythonFileInlineUrl(fileId),
    headers,
    loading,
    error,
  };
}
