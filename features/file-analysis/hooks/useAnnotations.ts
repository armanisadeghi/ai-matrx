/**
 * features/file-analysis/hooks/useAnnotations.ts
 *
 * Annotations CRUD with optimistic updates + Realtime push from
 * `file_page_annotations`. Returned API mirrors what the studio + tab
 * components need:
 *   { annotations, create, update, remove, refetch, byPageId }
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractErrorMessage } from "@/utils/errors";
import { createClient } from "@/utils/supabase/client";
import * as Api from "@/features/file-analysis/api/file-analysis";
import type {
  AnnotationCreateBody,
  AnnotationOut,
  AnnotationUpdateBody,
} from "@/features/file-analysis/api/file-analysis";

export interface UseAnnotationsResult {
  annotations: AnnotationOut[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  byPageId: Map<string, AnnotationOut[]>;
  byCategory: Map<string, AnnotationOut[]>;
  create: (body: AnnotationCreateBody) => Promise<AnnotationOut>;
  update: (
    annotationId: string,
    body: AnnotationUpdateBody,
  ) => Promise<AnnotationOut>;
  remove: (annotationId: string) => Promise<void>;
}

export function useAnnotations(
  fileId: string | null,
  filters?: { labelCategory?: string; pageNumber?: number; includeRejected?: boolean },
): UseAnnotationsResult {
  const [annotations, setAnnotations] = useState<AnnotationOut[]>([]);
  const [loading, setLoading] = useState<boolean>(!!fileId);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  // Keep the filter object stable across renders.
  const filterRef = useRef(filters);
  filterRef.current = filters;

  const refetch = useCallback(() => setRetry((n) => n + 1), []);

  useEffect(() => {
    if (!fileId) {
      setAnnotations([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Api.listAnnotations(fileId, filterRef.current ?? {})
      .then(({ data }) => {
        if (cancelled) return;
        setAnnotations(data ?? []);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(extractErrorMessage(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    fileId,
    retry,
    filters?.labelCategory,
    filters?.pageNumber,
    filters?.includeRejected,
  ]);

  // Realtime — file_page_annotations.
  useEffect(() => {
    if (!fileId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`annotations:${fileId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "file_page_annotations",
          filter: `file_id=eq.${fileId}`,
        },
        () => setRetry((n) => n + 1),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fileId]);

  // ── mutators ──────────────────────────────────────────────────────────

  const create = useCallback(
    async (body: AnnotationCreateBody): Promise<AnnotationOut> => {
      if (!fileId) throw new Error("no fileId");
      const { data } = await Api.createAnnotation(fileId, body);
      setAnnotations((prev) => {
        // Optimistic insertion — server canonical wins.
        const without = prev.filter((a) => a.id !== data.id);
        return [...without, data];
      });
      return data;
    },
    [fileId],
  );

  const update = useCallback(
    async (
      annotationId: string,
      body: AnnotationUpdateBody,
    ): Promise<AnnotationOut> => {
      if (!fileId) throw new Error("no fileId");
      // Optimistic patch.
      setAnnotations((prev) =>
        prev.map((a) => (a.id === annotationId ? { ...a, ...body } : a)),
      );
      const { data } = await Api.updateAnnotation(fileId, annotationId, body);
      setAnnotations((prev) =>
        prev.map((a) => (a.id === annotationId ? data : a)),
      );
      return data;
    },
    [fileId],
  );

  const remove = useCallback(
    async (annotationId: string): Promise<void> => {
      if (!fileId) throw new Error("no fileId");
      // Optimistic removal.
      setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
      try {
        await Api.deleteAnnotation(fileId, annotationId);
      } catch (err) {
        // Roll back on failure.
        setRetry((n) => n + 1);
        throw err;
      }
    },
    [fileId],
  );

  // ── derived ──────────────────────────────────────────────────────────

  const byPageId = new Map<string, AnnotationOut[]>();
  const byCategory = new Map<string, AnnotationOut[]>();
  for (const a of annotations) {
    if (a.page_id) {
      const list = byPageId.get(a.page_id) ?? [];
      list.push(a);
      byPageId.set(a.page_id, list);
    }
    const cat = a.label_category;
    const lc = byCategory.get(cat) ?? [];
    lc.push(a);
    byCategory.set(cat, lc);
  }

  return {
    annotations,
    loading,
    error,
    refetch,
    byPageId,
    byCategory,
    create,
    update,
    remove,
  };
}
