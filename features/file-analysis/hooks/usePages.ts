/**
 * features/file-analysis/hooks/usePages.ts
 *
 * Shared-cache hook for `GET /files/{id}/pages`. Every consumer (the
 * studio's thumbnail strip, the analysis tab's overview, the studio
 * shell's page-id resolution) reads from one cache + subscribes to a
 * single Realtime channel for `files.pages` changes.
 *
 * REALTIME: `@ai-matrx/realtime` owns the channel — unique instance topic,
 * echo suppression, dedup, the decoupled handler queue, jittered reconnect,
 * the backfill door, tab sleep. This module hand-rolled a static topic
 * (`file-pages:<fileId>`), a raw `.channel(...).subscribe()`, a manual
 * `removeChannel` teardown, and NO catch-up read at all: a laptop that slept
 * through a whole analysis run came back to a thumbnail strip that looked
 * healthy and was permanently wrong. That is the bug this adoption fixes.
 * None of it may grow back — the package README is the doctrine.
 *
 * The one host-shaped thing left is fan-in: several surfaces mount this hook
 * for the same file, and they share ONE channel through `lib/realtime/
 * sharedChannel` (the app's single copy of that refcount, not a per-hook one).
 *
 * No write ledger here: this hook is read-only. Page mutations go through the
 * server API and land back as ordinary remote events.
 */

"use client";

import { useEffect, useMemo } from "react";
import { defineChannelNamespace } from "@ai-matrx/realtime";
import { useRealtimeManager } from "@ai-matrx/realtime/react";
import { openShared } from "@/lib/realtime/sharedChannel";
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

/** One place names this channel. A second, different declaration throws. */
const pagesChannel = defineChannelNamespace({
  namespace: "file-pages",
  parts: ["fileId"],
  description: "files.pages rows for one file",
});

/** The content this app renders off a page row — powers the echo test. */
function pageFingerprint(row: Record<string, unknown>): string {
  return JSON.stringify([
    row.status ?? null,
    row.page_number ?? null,
    row.width ?? null,
    row.height ?? null,
    row.image_file_id ?? null,
    row.thumbnail_file_id ?? null,
    row.text ?? null,
  ]);
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
  const manager = useRealtimeManager();

  useEffect(() => {
    if (!fileId || !manager) return undefined;
    const topic = pagesChannel.topic({ fileId });
    return openShared(manager, topic, () => ({
      topic,
      postgresChanges: [
        {
          event: "*",
          schema: "files",
          table: "pages",
          filter: `file_id=eq.${fileId}`,
          rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
          fingerprint: pageFingerprint,
          // Coalesce write bursts. Backend analysis flows update many rows per
          // second — without this, each event fired a fresh `GET
          // /files/{id}/pages` and the page hammered the server until the run
          // completed. `scheduleInvalidate` fires once leading, once trailing,
          // and drops the middle. Own echoes never reach here: the package's
          // write ledger drops them first.
          onChange: () => scheduleInvalidate(store, fileId),
        },
      ],
      // Realtime has no replay. Reconnect, tab wake, network restore and queue
      // overflow all land here, and the canonical page list is one read away.
      // The hand-rolled channel had no such door — this is the fix.
      onBackfill: () => {
        invalidateKey(store, fileId);
      },
    }));
  }, [fileId, manager]);

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
