"use client";

// features/scopes/hooks/useKindCounts.ts
//
// How many of each kind a person (or one organization) has — one round trip, the same filter as
// `useKindItems`, so a count always equals the list it opens. Logic only, no UI.
//
//   useKindCounts({ kind: "mine" })                              → the Source input's kinds
//   useKindCounts({ kind: "organization", organizationId }, { tokens: ["file", "note"] })
//
// `counts.get(token)` is a number, or `null` when that kind could not be counted (render a dash,
// never a fake 0). `tokens` is the order the database answered in (kinds with a count).

import React from "react";
import {
  fetchKindCounts,
  kindScopeFromKey,
  kindScopeKey,
  type KindScope,
} from "@/features/scopes/service/kindInventory";

export interface UseKindCountsResult {
  counts: Map<string, number | null>;
  /** The kinds answered, in registry order. */
  tokens: string[];
  loading: boolean;
  /** The count read failed — show it, never "you have nothing". */
  error: Error | null;
  retry: () => void;
}

export function useKindCounts(
  scope: KindScope | null | undefined,
  options?: { tokens?: readonly string[] },
): UseKindCountsResult {
  const scopeKey = kindScopeKey(scope);
  const tokensKey = options?.tokens ? options.tokens.join(",") : "";
  const [state, setState] = React.useState<{
    key: string;
    counts: Map<string, number | null>;
    error: Error | null;
  }>({ key: "", counts: new Map(), error: null });
  const [attempt, setAttempt] = React.useState(0);
  const requestKey = `${scopeKey}|${tokensKey}|${attempt}`;

  // Everything the read needs is carried by these strings, so a caller may pass a fresh scope
  // object every render without re-reading.
  React.useEffect(() => {
    const stableScope = kindScopeFromKey(scopeKey);
    if (!stableScope) return undefined;
    let cancelled = false;
    const tokens = tokensKey ? tokensKey.split(",") : undefined;
    fetchKindCounts(stableScope, tokens).then(
      (counts) => {
        if (!cancelled) setState({ key: requestKey, counts, error: null });
      },
      (error: unknown) => {
        console.error("[useKindCounts] count read failed:", error);
        if (!cancelled) {
          setState({
            key: requestKey,
            counts: new Map(),
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [requestKey, scopeKey, tokensKey]);

  const current = state.key === requestKey;
  return {
    counts: current ? state.counts : new Map(),
    tokens: current ? [...state.counts.keys()] : [],
    loading: scopeKey !== "" && !current,
    error: current ? state.error : null,
    retry: () => setAttempt((n) => n + 1),
  };
}
