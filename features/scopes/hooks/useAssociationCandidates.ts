// features/scopes/hooks/useAssociationCandidates.ts
//
// State wrapper around `listAssociationCandidates` — the picker's data source.
// One-shot fetch on mount/param-change; re-runs on `reload()` or search change.
// All querying logic lives in the service; this just owns loading/error state.

"use client";

import React from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  listAssociationCandidates,
  type CandidateRecord,
} from "@/features/scopes/service/associationCandidates";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

export interface UseAssociationCandidatesArgs {
  token: EntityTypeToken;
  /** Skip fetching (e.g. while the picker is closed). Defaults to true. */
  enabled?: boolean;
  search?: string;
  limit?: number;
}

export interface UseAssociationCandidatesReturn {
  candidates: CandidateRecord[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useAssociationCandidates(
  args: UseAssociationCandidatesArgs,
): UseAssociationCandidatesReturn {
  const { token, enabled = true, search, limit } = args;
  const userId = useAppSelector(selectUserId);
  const [candidates, setCandidates] = React.useState<CandidateRecord[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const res = await listAssociationCandidates({
        token,
        ownerId: userId,
        search,
        limit,
      });
      if (cancelled) return;
      if (res.ok) {
        setCandidates(res.data);
      } else {
        setError(res.error);
        setCandidates([]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, enabled, userId, search, limit, tick]);

  return {
    candidates,
    loading,
    error,
    reload: () => setTick((t) => t + 1),
  };
}
