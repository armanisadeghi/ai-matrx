"use client";

import { useCallback, useEffect, useState } from "react";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { fetchCodingSessions, type CodingSessionView } from "./service";

export interface CodingSessionsState {
  sessions: CodingSessionView[];
  loading: boolean;
  error: string | null;
  checkedAtMs: number;
  refresh: () => void;
}

export function useCodingSessions(): CodingSessionsState {
  const [sessions, setSessions] = useState<CodingSessionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkedAtMs, setCheckedAtMs] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const beginRequest = useLatestRequest();

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    setRefreshKey((key) => key + 1);
  }, []);

  useEffect(() => {
    const isCurrent = beginRequest();

    void fetchCodingSessions()
      .then((rows) => {
        if (!isCurrent()) return;
        setSessions(rows);
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

  return { sessions, loading, error, checkedAtMs, refresh };
}
