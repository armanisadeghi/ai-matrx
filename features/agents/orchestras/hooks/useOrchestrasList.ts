// features/agents/agent-sets/hooks/useAgentSetsList.ts
"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchAgentSets } from "@/features/agents/redux/agent-sets/thunks";
import {
  selectAgentSetsList,
  selectAgentSetsListError,
  selectAgentSetsListStatus,
} from "@/features/agents/redux/agent-sets/selectors";

/** Loads + selects every set the user can see. Auto-fetches on mount. */
export function useAgentSetsList(opts?: { auto?: boolean }) {
  const dispatch = useAppDispatch();
  const sets = useAppSelector(selectAgentSetsList);
  const status = useAppSelector(selectAgentSetsListStatus);
  const error = useAppSelector(selectAgentSetsListError);

  useEffect(() => {
    if (opts?.auto !== false) dispatch(fetchAgentSets());
  }, [dispatch, opts?.auto]);

  return {
    sets,
    status,
    error,
    reload: () => dispatch(fetchAgentSets({ force: true })),
  };
}
