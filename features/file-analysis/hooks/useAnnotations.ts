/**
 * features/file-analysis/hooks/useAnnotations.ts
 *
 * Shared-cache hook for annotations. Every consumer (canvas overlay,
 * annotations panel, redact panel, findings panel, …) reads from one
 * cache + subscribes to a single Realtime channel.
 *
 * Mutators (create / update / remove) optimistically write into the
 * cache via `mutate`, then issue the network call. On failure the cache
 * invalidates and refetches. On a genuine remote INSERT / UPDATE / DELETE the
 * cache invalidates so every consumer re-renders with the canonical server
 * state.
 *
 * REALTIME: `@ai-matrx/realtime` owns the channel (unique instance topic, echo
 * suppression, dedup, the decoupled handler queue, reconnect, backfill, tab
 * sleep). This module hand-rolled none of that and must never grow it back —
 * a second copy beside the package is the named failure. The package README
 * is the doctrine.
 *
 * Two things this file DOES own, because they are host-shaped:
 *
 * 1. **One channel per file, not one per consumer.** Four surfaces mount this
 *    hook for the same `fileId` at once. `useChannel` would open four channels;
 *    the refcount below keeps exactly one, opened through `manager.open` — the
 *    package's sanctioned non-hook door (README § Migrating off hand-rolled
 *    channels).
 * 2. **Registering our own writes on the manager's write ledger** so their
 *    echoes are classified as `own-echo` and never cost a refetch. Before the
 *    ledger existed, every local edit's echo (50–500ms later, after the REST
 *    response had already landed) invalidated the cache and refetched the
 *    whole annotation list.
 */

"use client";

import { useCallback, useEffect, useMemo } from "react";
import { defineChannelNamespace } from "@ai-matrx/realtime";
import { useRealtimeManager } from "@ai-matrx/realtime/react";
import type { RealtimeManager } from "@ai-matrx/realtime";
import * as Api from "@/features/file-analysis/api/file-analysis";
import type {
  AnnotationCreateBody,
  AnnotationOut,
  AnnotationUpdateBody,
} from "@/features/file-analysis/api/file-analysis";
import {
  createSharedStore,
  invalidateKey,
  scheduleInvalidate,
  useSharedStore,
} from "./shared-cache";

const store = createSharedStore<AnnotationOut[]>(async (fileId) => {
  const { data } = await Api.listAnnotations(fileId, {});
  return data ?? [];
});

/** One place names this channel. A second, different declaration throws. */
const annotationsChannel = defineChannelNamespace({
  namespace: "file-annotations",
  parts: ["fileId"],
  description: "files.page_annotations rows for one file",
});

const ANNOTATIONS_TABLE = "files.page_annotations";

/**
 * The content this app can change on an annotation. Powers the ledger's
 * content-aware echo test (a same-millisecond collaborator edit still lands).
 */
function annotationFingerprint(row: Record<string, unknown>): string {
  return JSON.stringify([
    row.label ?? null,
    row.label_category ?? null,
    row.bbox ?? null,
    row.extracted_text ?? null,
    row.normalized_value ?? null,
    row.status ?? null,
    row.redact ?? null,
    row.notes ?? null,
    row.is_user_locked ?? null,
  ]);
}

interface Attachment {
  manager: RealtimeManager;
  count: number;
  close: () => void;
}

const realtimeRefcount = new Map<string, Attachment>();

function attachRealtime(manager: RealtimeManager, fileId: string): void {
  const existing = realtimeRefcount.get(fileId);
  if (existing) {
    // Same manager — share the one channel.
    if (existing.manager === manager) {
      existing.count += 1;
      return;
    }
    // The provider rebuilt its manager (client or signed-in user changed);
    // the old manager already disposed its channels. Re-open on the new one.
    existing.close();
    realtimeRefcount.delete(fileId);
  }
  const handle = manager.open({
    topic: annotationsChannel.topic({ fileId }),
    postgresChanges: [
      {
        event: "*",
        schema: "files",
        table: "page_annotations",
        filter: `file_id=eq.${fileId}`,
        rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
        fingerprint: annotationFingerprint,
        // Coalesce bursts (bulk annotation imports, AI detector batch
        // INSERTs) into 1 leading + 1 trailing refetch instead of N. Own
        // echoes never reach here — the ledger drops them first.
        onChange: () => scheduleInvalidate(store, fileId),
      },
    ],
    // Realtime has no replay. Reconnect, tab wake, network restore, and queue
    // overflow all land here, and the canonical server list is one refetch away.
    onBackfill: () => {
      invalidateKey(store, fileId);
    },
  });
  realtimeRefcount.set(fileId, { manager, count: 1, close: () => handle.close() });
}

function detachRealtime(fileId: string): void {
  const existing = realtimeRefcount.get(fileId);
  if (!existing) return;
  existing.count -= 1;
  if (existing.count <= 0) {
    existing.close();
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
  const manager = useRealtimeManager();

  useEffect(() => {
    if (!fileId || !manager) return undefined;
    attachRealtime(manager, fileId);
    return () => detachRealtime(fileId);
  }, [fileId, manager]);

  const annotations = data ?? [];

  /** Teach the ledger what the server just returned, so its echo is silent. */
  const recordServerRow = useCallback(
    (row: AnnotationOut) => {
      manager?.ledger.observe({
        table: ANNOTATIONS_TABLE,
        id: row.id,
        updatedAt: row.updated_at ?? null,
        fingerprint: annotationFingerprint(row as unknown as Record<string, unknown>),
      });
    },
    [manager],
  );

  const create = useCallback(
    async (body: AnnotationCreateBody): Promise<AnnotationOut> => {
      if (!fileId) throw new Error("no fileId");
      const { data } = await Api.createAnnotation(fileId, body);
      recordServerRow(data);
      mutate((prev) => {
        const without = (prev ?? []).filter((a) => a.id !== data.id);
        return [...without, data];
      });
      return data;
    },
    [fileId, mutate, recordServerRow],
  );

  const update = useCallback(
    async (
      annotationId: string,
      body: AnnotationUpdateBody,
    ): Promise<AnnotationOut> => {
      if (!fileId) throw new Error("no fileId");
      // Register the write BEFORE the optimistic patch (R6): the echo is then
      // suppressed while a genuine collaborator write still lands.
      const previous = (data ?? []).find((a) => a.id === annotationId);
      const expected = previous
        ? annotationFingerprint({
            ...(previous as unknown as Record<string, unknown>),
            ...(body as unknown as Record<string, unknown>),
          })
        : undefined;
      const ticket = manager?.ledger.begin({
        table: ANNOTATIONS_TABLE,
        id: annotationId,
        ...(expected !== undefined ? { fingerprint: expected } : {}),
      });
      // Optimistic patch through the shared cache.
      mutate((prev) =>
        (prev ?? []).map((a) =>
          a.id === annotationId ? { ...a, ...body } : a,
        ) as AnnotationOut[],
      );
      try {
        const { data: saved } = await Api.updateAnnotation(
          fileId,
          annotationId,
          body,
        );
        if (ticket) {
          manager?.ledger.settle(ticket, {
            updatedAt: saved.updated_at ?? undefined,
            fingerprint: annotationFingerprint(
              saved as unknown as Record<string, unknown>,
            ),
          });
        }
        mutate((prev) =>
          (prev ?? []).map((a) => (a.id === annotationId ? saved : a)),
        );
        return saved;
      } catch (err) {
        if (ticket) manager?.ledger.abandon(ticket);
        invalidateKey(store, fileId);
        throw err;
      }
    },
    [fileId, mutate, manager, data],
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
