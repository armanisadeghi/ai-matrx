"use client";

// features/settings/data-lifecycle/useDataLifecycle.ts
//
// The engine behind /settings/data. One read (`lifecycle_user_notice`) and one
// write (`lifecycle_user_keep`). No Redux slice: this is page-local, read on
// mount, and nothing else in the app needs it — a global store here would be a
// second source of truth for a number the database already answers exactly.

import { useCallback, useEffect, useState } from "react";
import {
  fetchLifecycleNotice,
  keepPendingEntity,
  type LifecycleNotice,
} from "./lifecycleService";

export interface UseDataLifecycle {
  notice: LifecycleNotice | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Keep every pending row of one entity. Optimistic, then refetched. */
  keep: (entityToken: string) => Promise<number>;
  /** The entity token currently being kept, for per-row busy state. */
  keeping: string | null;
}

export function useDataLifecycle(): UseDataLifecycle {
  const [notice, setNotice] = useState<LifecycleNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keeping, setKeeping] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null); // a successful reload must never sit behind a stale error
    try {
      setNotice(await fetchLifecycleNotice());
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't load this page.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const keep = useCallback(
    async (entityToken: string) => {
      setKeeping(entityToken);
      // Optimistic: the group leaves the list immediately. The refetch below is
      // the truth; a failure restores the previous notice verbatim.
      const previous = notice;
      if (previous) {
        const gone = previous.pending.find((p) => p.entity_token === entityToken);
        const rows = gone?.rows ?? 0;
        setNotice({
          ...previous,
          pending: previous.pending.filter((p) => p.entity_token !== entityToken),
          pending_rows: Math.max(0, previous.pending_rows - rows),
          rows_in_warning_window: gone?.in_warning_window
            ? Math.max(0, previous.rows_in_warning_window - rows)
            : previous.rows_in_warning_window,
        });
      }
      try {
        const res = await keepPendingEntity(entityToken);
        await load();
        return res.rows_kept;
      } catch (e) {
        if (previous) setNotice(previous);
        throw e;
      } finally {
        setKeeping(null);
      }
    },
    [notice, load],
  );

  return { notice, loading, error, refresh: load, keep, keeping };
}
