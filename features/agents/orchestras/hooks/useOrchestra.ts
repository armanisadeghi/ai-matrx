// features/agents/orchestras/hooks/useOrchestra.ts
"use client";

import { useEffect, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { loadOrchestra } from "@/features/agents/redux/orchestras/thunks";
import { makeSelectOrchestraEntry } from "@/features/agents/redux/orchestras/selectors";

/** Loads + selects one Orchestra's members + config. Auto-loads on mount. */
export function useOrchestra(conductorId: string, opts?: { auto?: boolean }) {
  const dispatch = useAppDispatch();
  const selectEntry = useMemo(
    () => makeSelectOrchestraEntry(conductorId),
    [conductorId],
  );
  const entry = useAppSelector(selectEntry);

  useEffect(() => {
    if (opts?.auto !== false && conductorId) {
      dispatch(loadOrchestra(conductorId));
    }
  }, [dispatch, conductorId, opts?.auto]);

  return {
    members: entry.members,
    config: entry.config,
    label: entry.label,
    exists: entry.exists,
    status: entry.status,
    error: entry.error,
    reload: () => dispatch(loadOrchestra(conductorId, { force: true })),
  };
}
