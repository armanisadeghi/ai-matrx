"use client";

// features/mandates/runs/useStoredRun.ts — one stored mandate run, read once
// per conversation id through `GET /mandates/runs/{conversation_id}`.

import { useEffect, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { fetchStoredRun, type StoredRun } from "./service";

export interface StoredRunState {
  conversationId: string;
  run: StoredRun | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useStoredRun(conversationId: string): StoredRunState {
  const dispatch = useAppDispatch();
  const [run, setRun] = useState<StoredRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchStoredRun(dispatch, conversationId)
      .then((next) => {
        if (!cancelled) setRun(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "The run could not be read.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, conversationId, attempt]);

  return { conversationId, run, loading, error, retry: () => setAttempt((n) => n + 1) };
}
