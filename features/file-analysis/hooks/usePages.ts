/**
 * features/file-analysis/hooks/usePages.ts
 *
 * Shared-cache hook for `GET /files/{id}/pages`. Every consumer (the
 * studio's thumbnail strip, the analysis tab's overview, the studio
 * shell's page-id resolution) reads from one cache + subscribes to a
 * single Realtime channel for file_pages changes.
 */

"use client";

import { useEffect, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import * as Api from "@/features/file-analysis/api/file-analysis";
import type { FilePageOut } from "@/features/file-analysis/api/file-analysis";
import {
  createSharedStore,
  invalidateKey,
  scheduleInvalidate,
  useSharedStore,
} from "./shared-cache";

const store = createSharedStore<FilePageOut[]>(async (fileId) => {
  const { data } = await Api.listPages(fileId);
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
    .channel(`file-pages:${fileId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "files",
        table: "pages",
        filter: `file_id=eq.${fileId}`,
      },
      // Coalesce write bursts. Backend analysis flows update many rows per
      // second — without this, each Postgres NOTIFY fired a fresh `GET
      // /files/{id}/pages` and the page hammered the server until the run
      // completed. `scheduleInvalidate` fires once at the start, once at
      // the end, and drops the middle.
      () => scheduleInvalidate(store, fileId),
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

export interface UsePagesResult {
  pages: FilePageOut[];
  active: FilePageOut[];
  byPageId: Map<string, FilePageOut>;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePages(fileId: string | null): UsePagesResult {
  const { data, loading, error, refetch } = useSharedStore(store, fileId);

  useEffect(() => {
    if (!fileId) return;
    attachRealtime(fileId);
    return () => detachRealtime(fileId);
  }, [fileId]);

  const pages = data ?? [];
  const active = useMemo(
    () => pages.filter((p) => p.status === "active"),
    [pages],
  );
  const byPageId = useMemo(
    () => new Map(pages.map((p) => [p.id, p])),
    [pages],
  );

  return { pages, active, byPageId, loading, error, refetch };
}

export function invalidatePages(fileId: string): void {
  invalidateKey(store, fileId);
}
