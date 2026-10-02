"use client";

/**
 * useWorkingDocumentVersions — the durable, DB-backed version history for a
 * working document, sourced from `history.row_versions` via the canonical
 * versioning RPCs (`version_list` / `version_snapshot`). Every agent ctx_patch
 * and user commit is captured there by the `_history` trigger, so this is the
 * TRUE full history — unlike the old per-turn reconstruction from Redux chat
 * messages (`useWorkingDocumentTurnSnapshots`), which only knew turns still in
 * memory and vanished on reload.
 *
 * Version metadata (numbers, timestamps, current flag) loads eagerly; each
 * version's full text loads lazily via `getContent` (cached per document) so a
 * long history doesn't fan out into dozens of snapshot fetches on open. Callers
 * diff only the two versions on screen. State is written ONLY in async
 * callbacks; `loading` is derived (no synchronous setState in an effect).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  listWorkingDocumentVersions,
  getWorkingDocumentVersionContent,
  restoreWorkingDocumentVersion,
  type WorkingDocumentVersion,
} from "@/features/agents/redux/execution-system/instance-working-document/cx-working-document.service";

export interface UseWorkingDocumentVersions {
  versions: WorkingDocumentVersion[];
  loading: boolean;
  error: string | null;
  /** Lazily fetch (and cache) a version's full text content. */
  getContent: (version: number) => Promise<string | null>;
  /** Restore a prior version; returns the new version number. Refreshes the list. */
  restore: (version: number) => Promise<number>;
  /** Re-fetch the version list (e.g. after an external edit). */
  refresh: () => void;
}

interface VersionsState {
  versions: WorkingDocumentVersion[];
  error: string | null;
  /** Which document `versions`/`error` describe — drives the derived `loading`. */
  forDoc: string | null;
}

const INITIAL: VersionsState = { versions: [], error: null, forDoc: null };

export function useWorkingDocumentVersions(
  documentId: string | null,
): UseWorkingDocumentVersions {
  const [state, setState] = useState<VersionsState>(INITIAL);
  const [nonce, setNonce] = useState(0);

  // Content cache keyed by documentId → version → text. Touched only in
  // callbacks (never during render), so a document switch can't show stale text.
  const contentCache = useRef(new Map<string, Map<number, string | null>>());

  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;
    listWorkingDocumentVersions(documentId)
      .then((list) => {
        if (!cancelled) setState({ versions: list, error: null, forDoc: documentId });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setState({
            versions: [],
            error: e instanceof Error ? e.message : "Failed to load versions",
            forDoc: documentId,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, nonce]);

  // Derived — no setState needed. While the fetched-for doc doesn't match the
  // requested one, we're loading.
  const matches = state.forDoc === documentId;
  const loading = !!documentId && !matches;
  const versions = matches ? state.versions : [];
  const error = matches ? state.error : null;

  const getContent = useCallback(
    async (version: number): Promise<string | null> => {
      if (!documentId) return null;
      let docCache = contentCache.current.get(documentId);
      if (!docCache) {
        docCache = new Map();
        contentCache.current.set(documentId, docCache);
      }
      if (docCache.has(version)) return docCache.get(version) ?? null;
      const content = await getWorkingDocumentVersionContent(
        documentId,
        version,
      );
      docCache.set(version, content);
      return content;
    },
    [documentId],
  );

  const restore = useCallback(
    async (version: number): Promise<number> => {
      if (!documentId) throw new Error("No document to restore");
      const newVersion = await restoreWorkingDocumentVersion(
        documentId,
        version,
      );
      contentCache.current.delete(documentId);
      setNonce((n) => n + 1);
      return newVersion;
    },
    [documentId],
  );

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { versions, loading, error, getContent, restore, refresh };
}
