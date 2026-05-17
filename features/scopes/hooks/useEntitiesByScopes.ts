// features/scopes/hooks/useEntitiesByScopes.ts
//
// Public hook for the **reverse-index** read: given a set of scope_ids,
// return the entity ids that are tagged with ANY (`matchAll: false`) or
// ALL (`matchAll: true`) of them.
//
// This is what sidebars and list panes need when the user has active
// scopes globally and wants the surrounding list filtered to just the
// entities tagged with those scopes. The classic usage is the notes /
// tasks sidebar: "active scopes = [Client: Rejuvina] — show me only the
// notes I've tagged with that scope."
//
// Returns a `Set<string>` of entity ids (or `null` when scopes are
// empty — in which case the caller should skip filtering entirely).
// The hook fetches via the canonical `scopesService` chokepoint; it
// does NOT cache results in Redux because the inputs (active scopes)
// flip rapidly and the cache hit rate would be poor.
//
// The fetch is keyed on the sorted scope-id string + entity_type +
// match_all so identical re-queries are short-circuited; in-flight
// requests are deduped per key.

"use client";

import { useEffect, useRef, useState } from "react";
import { scopesService } from "@/features/scopes/service/scopesService";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { ScopeAssignmentEntityType } from "@/features/scopes/types";

export interface UseEntitiesByScopesArgs {
  /** active scope ids (typically from `selectScopeSelectionsContext`) */
  scopeIds: readonly string[];
  /** optional entity_type filter (note / task / agent / etc.) */
  entityType?: ScopeAssignmentEntityType;
  /** if true, require ALL scope_ids; otherwise ANY. Defaults to false. */
  matchAll?: boolean;
  /** when false, the hook returns null and skips fetching. */
  enabled?: boolean;
}

export interface UseEntitiesByScopesResult {
  /**
   * The matching entity ids as a Set. `null` means "no filter is active"
   * (either no scope_ids selected, or `enabled === false`, or initial
   * state before first fetch). Consumers should treat null as
   * "show everything; don't filter."
   */
  entityIds: Set<string> | null;
  /** True while the fetch is in flight for the current key. */
  isLoading: boolean;
  /** Last error message if the fetch failed; null otherwise. */
  error: string | null;
}

const inFlight = new Map<string, Promise<Set<string>>>();

function buildKey(
  scopeIds: readonly string[],
  entityType: ScopeAssignmentEntityType | undefined,
  matchAll: boolean,
): string {
  const sorted = [...scopeIds].sort().join(",");
  return `${entityType ?? "*"}|${matchAll ? "all" : "any"}|${sorted}`;
}

export function useEntitiesByScopes(
  args: UseEntitiesByScopesArgs,
): UseEntitiesByScopesResult {
  const { scopeIds, entityType, matchAll = false, enabled = true } = args;
  const [entityIds, setEntityIds] = useState<Set<string> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastKey = useRef<string>("");
  const stillMounted = useRef(true);

  useEffect(() => {
    stillMounted.current = true;
    return () => {
      stillMounted.current = false;
    };
  }, []);

  const isDisabled = !enabled || scopeIds.length === 0;

  useEffect(() => {
    if (isDisabled) {
      // Mark cache empty so the next valid input forces a fresh fetch. We
      // do not reset state here — React 19 canonical pattern is to derive
      // the disabled return value below instead of cascading setState.
      lastKey.current = "";
      return;
    }

    const key = buildKey(scopeIds, entityType, matchAll);
    if (key === lastKey.current) return;
    lastKey.current = key;

    // Async-fetch hook synchronizing React state with the network — the
    // canonical "subscribe to external system, setState in callback" case
    // from the React 19 docs. The setState calls below are the start/finish
    // of that subscription, not a derivation-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setError(null);

    const existing = inFlight.get(key);
    const promise =
      existing ??
      (async () => {
        const res = await scopesService.listEntitiesByScopes({
          scope_ids: [...scopeIds],
          entity_type: entityType,
          match_all: matchAll,
        });
        if (isScopesRpcErr(res)) throw new Error(res.error.message);
        return new Set(res.data.entities.map((e) => e.entity_id));
      })();

    if (!existing) inFlight.set(key, promise);

    promise
      .then((ids) => {
        if (!stillMounted.current || lastKey.current !== key) return;
        setEntityIds(ids);
        setIsLoading(false);
      })
      .catch((e: unknown) => {
        if (!stillMounted.current || lastKey.current !== key) return;
        setEntityIds(null);
        setError(e instanceof Error ? e.message : "Failed to filter by scopes");
        setIsLoading(false);
      })
      .finally(() => {
        if (inFlight.get(key) === promise) inFlight.delete(key);
      });
  }, [isDisabled, entityType, matchAll, scopeIds]);

  if (isDisabled) {
    return { entityIds: null, isLoading: false, error: null };
  }
  return { entityIds, isLoading, error };
}
