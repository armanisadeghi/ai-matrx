"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { fetchCodingSessions, type CodingSessionView } from "./service";

export interface CodingSessionsState {
  sessions: CodingSessionView[];
  loading: boolean;
  error: string | null;
  checkedAtMs: number;
  refresh: () => void;
  /** True when older bindings exist beyond the loaded pages. */
  hasMore: boolean;
  /** True while an older page is being appended. */
  loadingMore: boolean;
  /** Appends the next older keyset page to `sessions`. */
  loadOlder: () => void;
}

export function useCodingSessions(): CodingSessionsState {
  const [sessions, setSessions] = useState<CodingSessionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkedAtMs, setCheckedAtMs] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const beginRequest = useLatestRequest();

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    setRefreshKey((key) => key + 1);
  }, []);

  useEffect(() => {
    const isCurrent = beginRequest();

    void fetchCodingSessions()
      .then((page) => {
        if (!isCurrent()) return;
        setSessions(page.sessions);
        setHasMore(page.hasMore);
        cursorRef.current = page.oldestLastSeenAt;
        setCheckedAtMs(Date.now());
      })
      .catch((cause: unknown) => {
        if (!isCurrent()) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "The coding-session read failed.",
        );
        setCheckedAtMs(Date.now());
      })
      .finally(() => {
        if (isCurrent()) setLoading(false);
      });
  }, [beginRequest, refreshKey]);

  const loadOlder = useCallback(() => {
    const cursor = cursorRef.current;
    if (!cursor) return;
    setLoadingMore(true);
    void fetchCodingSessions({ beforeLastSeenAt: cursor })
      .then((page) => {
        // Append-only paging: a stale append is harmless because ids are
        // stable, but a refresh in flight resets via the effect above.
        setSessions((existing) => {
          const known = new Set(existing.map((session) => session.id));
          return [
            ...existing,
            ...page.sessions.filter((session) => !known.has(session.id)),
          ];
        });
        setHasMore(page.hasMore);
        cursorRef.current = page.oldestLastSeenAt;
      })
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "The coding-session read failed.",
        );
      })
      .finally(() => {
        setLoadingMore(false);
      });
  }, []);

  return {
    sessions,
    loading,
    error,
    checkedAtMs,
    refresh,
    hasMore,
    loadingMore,
    loadOlder,
  };
}
