/**
 * Hooks for fetching unified-document data via /api/document/*.
 *
 * No waterfalls — the viewer fetches detail + lineage + chunks in
 * parallel from the page component, not nested inside a chain of
 * useEffects.
 */

"use client";

import { useEffect, useState } from "react";
import { extractErrorMessage } from "@/utils/errors";
import {
  fetchDocument,
  fetchDocumentChunks,
  fetchDocumentLineage,
  fetchDocumentPage,
} from "@/features/rag/api/document";
import type {
  ChunkRow,
  DocumentDetail,
  LineageTree,
  PageDetail,
} from "@/features/rag/types/documents";

export interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

function useFetch<T>(
  key: string | null,
  loader: () => Promise<T>,
): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!!key);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!key) {
      setData(null);
      setLoading(false);
      setError(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loader()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(extractErrorMessage(err) || "Request failed");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  return { data, loading, error, refetch: () => setTick((t) => t + 1) };
}

export function useDocument(docId: string | null): FetchState<DocumentDetail> {
  return useFetch(docId, () => fetchDocument(docId as string));
}

export function useDocumentLineage(
  docId: string | null,
): FetchState<LineageTree> {
  return useFetch(docId ? `${docId}:lineage` : null, () =>
    fetchDocumentLineage(docId as string),
  );
}

export function useDocumentPage(
  docId: string | null,
  pageIndex: number | null,
  opts: { includeBlocks?: boolean; includeWords?: boolean } = {},
): FetchState<PageDetail> {
  const blockKey = opts.includeBlocks ? "b" : "";
  const wordKey = opts.includeWords ? "w" : "";
  const key =
    docId && pageIndex !== null
      ? `${docId}:p${pageIndex}:${blockKey}${wordKey}`
      : null;
  return useFetch(key, () =>
    fetchDocumentPage(docId as string, pageIndex as number, opts),
  );
}

export function useDocumentChunks(
  docId: string | null,
  filters: {
    parentOnly?: boolean;
    childrenOnly?: boolean;
    sectionKind?: string;
    limit?: number;
  } = {},
): FetchState<ChunkRow[]> {
  const key = docId
    ? `${docId}:chunks:${filters.parentOnly ? "p" : ""}${
        filters.childrenOnly ? "c" : ""
      }:${filters.sectionKind ?? ""}:${filters.limit ?? ""}`
    : null;
  return useFetch(key, () => fetchDocumentChunks(docId as string, filters));
}
