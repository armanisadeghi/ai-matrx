/**
 * features/file-analysis/hooks/useAnnotations.ts
 *
 * Shared-cache hook for annotations. Every consumer (canvas overlay,
 * annotations panel, redact panel, findings panel, …) reads from one
 * cache + subscribes to a single Realtime channel.
 *
 * Mutators (create / update / remove) optimistically write into the
 * cache via `mutate`, then issue the network call. On failure the cache
 * invalidates and refetches. On Realtime UPDATE / INSERT / DELETE the
 * cache invalidates so every consumer re-renders with the canonical
 * server state.
 */

"use client";

import { useCallback, useEffect, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import * as Api from "@/features/file-analysis/api/file-analysis";
import type {
  AnnotationCreateBody,
  AnnotationOut,
  AnnotationUpdateBody,
} from "@/features/file-analysis/api/file-analysis";
import {
  createSharedStore,
  invalidateKey,
  useSharedStore,
} from "./shared-cache";

const store = createSharedStore<AnnotationOut[]>(async (fileId) => {
  const { data } = await Api.listAnnotations(fileId, {});
  return data ?? [];
});

const realtimeRefcount = new Map<string, { count: number; cleanup: () => void }>();

function attachRealtime(fileId: string): void {
  const existing = realtimeRefcount.get(fileId);
  if (existing) {
    existing.count += 1;
    return;
  }
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
      () => invalidateKey(store, fileId),
    )
    .subscribe();
  realtimeRefcount.set(fileId, {
    count: 1,
    cleanup: () => {
      void supabase.removeChannel(channel);
    },
  });
}

function detachRealtime(fileId: string): void {
  const existing = realtimeRefcount.get(fileId);
  if (!existing) return;
  existing.count -= 1;
  if (existing.count <= 0) {
    existing.cleanup();
    realtimeRefcount.delete(fileId);
  }
}

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

export function useAnnotations(fileId: string | null): UseAnnotationsResult {
  const { data, loading, error, refetch, mutate } = useSharedStore(store, fileId);

  useEffect(() => {
    if (!fileId) return;
    attachRealtime(fileId);
    return () => detachRealtime(fileId);
  }, [fileId]);

  const annotations = data ?? [];

  const create = useCallback(
    async (body: AnnotationCreateBody): Promise<AnnotationOut> => {
      if (!fileId) throw new Error("no fileId");
      const { data } = await Api.createAnnotation(fileId, body);
      mutate((prev) => {
        const without = (prev ?? []).filter((a) => a.id !== data.id);
        return [...without, data];
      });
      return data;
    },
    [fileId, mutate],
  );

  const update = useCallback(
    async (
      annotationId: string,
      body: AnnotationUpdateBody,
    ): Promise<AnnotationOut> => {
      if (!fileId) throw new Error("no fileId");
      // Optimistic patch through the shared cache.
      mutate((prev) =>
        (prev ?? []).map((a) =>
          a.id === annotationId ? { ...a, ...body } : a,
        ) as AnnotationOut[],
      );
      try {
        const { data } = await Api.updateAnnotation(fileId, annotationId, body);
        mutate((prev) =>
          (prev ?? []).map((a) => (a.id === annotationId ? data : a)),
        );
        return data;
      } catch (err) {
        invalidateKey(store, fileId);
        throw err;
      }
    },
    [fileId, mutate],
  );

  const remove = useCallback(
    async (annotationId: string): Promise<void> => {
      if (!fileId) throw new Error("no fileId");
      mutate((prev) => (prev ?? []).filter((a) => a.id !== annotationId));
      try {
        await Api.deleteAnnotation(fileId, annotationId);
      } catch (err) {
        invalidateKey(store, fileId);
        throw err;
      }
    },
    [fileId, mutate],
  );

  const byPageId = useMemo(() => {
    const out = new Map<string, AnnotationOut[]>();
    for (const a of annotations) {
      if (!a.page_id) continue;
      const list = out.get(a.page_id) ?? [];
      list.push(a);
      out.set(a.page_id, list);
    }
    return out;
  }, [annotations]);

  const byCategory = useMemo(() => {
    const out = new Map<string, AnnotationOut[]>();
    for (const a of annotations) {
      const list = out.get(a.label_category) ?? [];
      list.push(a);
      out.set(a.label_category, list);
    }
    return out;
  }, [annotations]);

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

export function invalidateAnnotations(fileId: string): void {
  invalidateKey(store, fileId);
}
