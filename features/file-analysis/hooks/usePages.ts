/**
 * features/file-analysis/hooks/usePages.ts
 *
 * Load + subscribe to file_pages for a file. Exposes the page-anchored
 * "what's in this doc right now" feed plus the active-pages-only filter.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { extractErrorMessage } from "@/utils/errors";
import { createClient } from "@/utils/supabase/client";
import * as Api from "@/features/file-analysis/api/file-analysis";
import type { FilePageOut } from "@/features/file-analysis/api/file-analysis";

export interface UsePagesResult {
  pages: FilePageOut[];
  active: FilePageOut[];
  byPageId: Map<string, FilePageOut>;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePages(fileId: string | null): UsePagesResult {
  const [pages, setPages] = useState<FilePageOut[]>([]);
  const [loading, setLoading] = useState<boolean>(!!fileId);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const refetch = useCallback(() => setRetry((n) => n + 1), []);

  useEffect(() => {
    if (!fileId) {
      setPages([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Api.listPages(fileId)
      .then(({ data }) => {
        if (cancelled) return;
        setPages(data ?? []);
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
  }, [fileId, retry]);

  // Realtime — file_pages UPDATE / INSERT.
  useEffect(() => {
    if (!fileId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`file-pages:${fileId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "file_pages",
          filter: `file_id=eq.${fileId}`,
        },
        () => setRetry((n) => n + 1),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fileId]);

  const active = pages.filter((p) => p.status === "active");
  const byPageId = new Map(pages.map((p) => [p.id, p]));

  return { pages, active, byPageId, loading, error, refetch };
}
