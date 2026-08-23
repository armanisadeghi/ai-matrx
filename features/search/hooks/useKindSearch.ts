"use client";

/**
 * useKindSearch — runs the query that is IN THE URL, and nothing else.
 *
 * The query string is the state of this surface: the workspace writes it to
 * the URL, this hook watches it, and back/forward therefore replay searches
 * for free. A query change aborts the in-flight request before starting the
 * next one, so a fast typist never sees an older answer land on a newer query.
 */

import { useEffect, useState } from "react";
import { useBackendApi } from "@/hooks/useBackendApi";
import { runKindSearch } from "../service";
import type { SearchOutcome, SearchPhase, SearchProvider } from "../types";

export interface KindSearchState {
  phase: SearchPhase;
  outcome: SearchOutcome | null;
  /** Human-readable failure text. Non-null only while `phase === "error"`. */
  error: string | null;
  /** Re-run the same query (the error state's one action). */
  retry: () => void;
}

export function useKindSearch(
  query: string,
  provider: SearchProvider,
  count: number,
): KindSearchState {
  const { post } = useBackendApi();
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<SearchPhase>(query ? "searching" : "idle");
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setPhase("idle");
      setOutcome(null);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setPhase("searching");
    setOutcome(null);
    setError(null);

    runKindSearch({
      post,
      query: trimmed,
      provider,
      count,
      signal: controller.signal,
      onOutcome: (next) => {
        if (controller.signal.aborted) return;
        setOutcome(next);
      },
    })
      .then(() => {
        if (controller.signal.aborted) return;
        setPhase("done");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error && err.message
            ? err.message
            : "The search failed. Try again in a moment.",
        );
        setPhase("error");
      });

    return () => controller.abort();
  }, [query, provider, count, attempt, post]);

  return {
    phase,
    outcome,
    error,
    retry: () => setAttempt((n) => n + 1),
  };
}
