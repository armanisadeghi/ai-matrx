// features/agents/agent-sets/hooks/useAgentSet.ts
"use client";

import { useEffect, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { loadAgentSet } from "@/features/agents/redux/agent-sets/thunks";
import { makeSelectAgentSetEntry } from "@/features/agents/redux/agent-sets/selectors";

/** Loads + selects one set's members + config. Auto-loads on mount. */
export function useAgentSet(orchestratorId: string, opts?: { auto?: boolean }) {
  const dispatch = useAppDispatch();
  const selectEntry = useMemo(
    () => makeSelectAgentSetEntry(orchestratorId),
    [orchestratorId],
  );
  const entry = useAppSelector(selectEntry);

  useEffect(() => {
    if (opts?.auto !== false && orchestratorId) {
      dispatch(loadAgentSet(orchestratorId));
    }
  }, [dispatch, orchestratorId, opts?.auto]);

  return {
    members: entry.members,
    config: entry.config,
    label: entry.label,
    exists: entry.exists,
    status: entry.status,
    error: entry.error,
    reload: () => dispatch(loadAgentSet(orchestratorId, { force: true })),
  };
}
