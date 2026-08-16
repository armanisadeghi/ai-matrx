"use client";

/**
 * useAccessStates — the LIST counterpart of `useAccessGate`.
 *
 * `useAccessGate` answers "why can't I open THIS record" for a whole page. A
 * table is the other shape of the same question: a roster joins to another
 * table, some of those embeds come back null, and every one of them is
 * ambiguous for the same four reasons (denied / deleted / missing / signed
 * out). Rendering "(record unavailable)" is the surface guessing — the exact
 * thing `features/access-gate` exists to stop.
 *
 * One hook resolves every unresolved id on the page at once and hands the
 * answers back as a map, so BOTH halves of the fix read the same truth:
 *   - the cell renders the real state (`<UnresolvedEntityRef>`), and
 *   - the row's action menu suppresses the actions that state cannot satisfy.
 *
 * Answers are cached module-wide by `token:id` because a denial does not change
 * while the user pages back and forth, and because the same party can appear in
 * several lists. `refresh()` clears the ids it owns — that is what makes the
 * "Request access" loop close in place once the owner grants.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAccessDeniedContext } from "@/features/access-gate/service/accessDeniedContext";
import type { AccessDeniedContext } from "@/features/access-gate/types";

/** Resolved answers, shared across surfaces. A denial is stable; re-asking is waste. */
const CACHE = new Map<string, AccessDeniedContext>();
/** In-flight promises, so ten rows naming one party issue ONE rpc. */
const INFLIGHT = new Map<string, Promise<AccessDeniedContext>>();

function cacheKey(token: string, id: string): string {
  return `${token}:${id}`;
}

function resolveOne(token: string, id: string): Promise<AccessDeniedContext> {
  const key = cacheKey(token, id);
  const cached = CACHE.get(key);
  if (cached) return Promise.resolve(cached);

  const existing = INFLIGHT.get(key);
  if (existing) return existing;

  // `fetchAccessDeniedContext` never throws — it degrades to `status: "error"`,
  // which the UI renders as a retry-able fault rather than as a denial.
  const promise = fetchAccessDeniedContext(token, id).then((context) => {
    INFLIGHT.delete(key);
    // A resolver fault is not an answer — caching it would freeze a transient
    // outage into a permanent "we couldn't check" for the rest of the session.
    if (context.status !== "error") CACHE.set(key, context);
    return context;
  });
  INFLIGHT.set(key, promise);
  return promise;
}

export interface UseAccessStatesResult {
  /** Resolved answers by record id. An absent id is still resolving. */
  states: ReadonlyMap<string, AccessDeniedContext>;
  /** True while at least one id on this page has no answer yet. */
  isLoading: boolean;
  /** Drop the cached answers for these ids and ask again. */
  refresh: () => void;
}

/**
 * Resolve the true access state of every id in `ids` for one entity token.
 *
 * Pass ONLY the ids that actually failed to resolve. Asking about records the
 * caller can already read is a wasted round trip per row, and the resolver is
 * deliberately a per-record call.
 */
export function useAccessStates(
  token: string,
  ids: readonly string[],
): UseAccessStatesResult {
  const [nonce, setNonce] = useState(0);
  const [resolved, setResolved] = useState<
    ReadonlyMap<string, AccessDeniedContext>
  >(() => new Map());

  // A stable identity for "which ids are we asking about", so the effect does
  // not re-run on every render just because the caller rebuilt the array.
  const idKey = useMemo(() => Array.from(new Set(ids)).sort().join(","), [ids]);

  useEffect(() => {
    const wanted = idKey ? idKey.split(",") : [];
    if (wanted.length === 0) return;

    let active = true;
    void Promise.all(
      wanted.map((id) =>
        resolveOne(token, id).then(
          (context) => [id, context] as const,
        ),
      ),
    ).then((entries) => {
      if (active) setResolved(new Map(entries));
    });
    return () => {
      active = false;
    };
    // `nonce` is the refresh trigger: bumping it re-runs the same question.
  }, [token, idKey, nonce]);

  const refresh = useCallback(() => {
    for (const id of idKey ? idKey.split(",") : []) {
      CACHE.delete(cacheKey(token, id));
    }
    setNonce((n) => n + 1);
  }, [token, idKey]);

  // What we publish is DERIVED, never cleared by the effect: an answer for an id
  // the page no longer shows is stale, not wrong, and clearing it with a
  // synchronous setState inside the effect is exactly the cascading-render
  // pattern React Compiler lint rejects.
  const wanted = useMemo(() => (idKey ? idKey.split(",") : []), [idKey]);
  const states = useMemo(() => {
    const out = new Map<string, AccessDeniedContext>();
    for (const id of wanted) {
      const context = resolved.get(id);
      if (context) out.set(id, context);
    }
    return out;
  }, [wanted, resolved]);

  return {
    states,
    isLoading: states.size < wanted.length,
    refresh,
  };
}
