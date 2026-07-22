"use client";

// features/agents/hooks/useServerAgentSearch.ts
//
// THE hook that makes agent search reach past what the client happens to have
// loaded. Drop it beside any agent search input; it needs nothing but the
// query string.
//
// The problem it solves: the agent list is paginated, so a purely local search
// answers "no results" for agents that were never fetched. That is not a
// missing feature, it is a wrong answer — and it is exactly how an agent went
// missing from search while its own route worked fine.
//
// The contract:
//   - Local matches keep rendering the whole time. This hook never clears,
//     replaces, or reorders the store; the thunk it dispatches only ADDS.
//   - Server results merge in and simply appear. Nothing on screen vanishes.
//   - Debounced, and stale responses are ignored so a slow reply for an old
//     query can never land after a newer one.
//
// Tier 2 (`deep`) additionally searches each agent's prompt content. It is
// opt-in because it answers a different question, and it always ranks below
// tier-1 matches so it can only append beneath the obvious answers.

import { useEffect, useRef, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { searchAgentsServer } from "@/features/agents/redux/agent-definition/thunks";

const DEBOUNCE_MS = 250;

/** Below this length a query matches too much to be worth a round trip. */
const MIN_QUERY_LENGTH = 2;

export interface ServerAgentSearchState {
  /** A server search is in flight for the current query. */
  isSearching: boolean;
  /** Matched ids in server rank order, or null before the first response. */
  matchedIds: string[] | null;
  /** Set when the search failed. Local results still render. */
  error: string | null;
}

/**
 * Runs a debounced server-side agent search whenever `query` (or `deep`)
 * changes, merging every hit into the agent store additively.
 *
 * @param query the user's search text
 * @param deep  tier 2 — also search agent prompt content
 */
export function useServerAgentSearch(
  query: string,
  deep = false,
): ServerAgentSearchState {
  const dispatch = useAppDispatch();
  const [isSearching, setIsSearching] = useState(false);
  const [matchedIds, setMatchedIds] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Monotonic request id — a response is applied only if it is still the
  // newest request. Without this, a slow reply for "gen" can land after the
  // reply for "generate images" and clobber the newer result.
  const requestSeq = useRef(0);

  useEffect(() => {
    const q = query.trim();

    if (q.length < MIN_QUERY_LENGTH) {
      setIsSearching(false);
      setMatchedIds(null);
      setError(null);
      return;
    }

    const seq = ++requestSeq.current;
    setIsSearching(true);
    setError(null);

    const timer = setTimeout(() => {
      void dispatch(searchAgentsServer({ query: q, deep }))
        .unwrap()
        .then((result) => {
          if (seq !== requestSeq.current) return; // superseded
          setMatchedIds(result.ids);
          setIsSearching(false);
        })
        .catch((e: unknown) => {
          if (seq !== requestSeq.current) return; // superseded
          // Loud, but never destructive: local results stay on screen.
          const message = e instanceof Error ? e.message : String(e);
          console.error("[useServerAgentSearch] search failed", {
            query: q,
            deep,
            error: message,
          });
          setError(message);
          setIsSearching(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, deep, dispatch]);

  return { isSearching, matchedIds, error };
}
