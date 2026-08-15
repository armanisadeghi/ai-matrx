// features/agents/orchestras/hooks/useOrchestrasList.ts
"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchOrchestras } from "@/features/agents/redux/orchestras/thunks";
import {
  selectOrchestrasList,
  selectOrchestrasListError,
  selectOrchestrasListStatus,
} from "@/features/agents/redux/orchestras/selectors";

/** Loads + selects every set the user can see. Auto-fetches on mount. */
export function useOrchestrasList(opts?: { auto?: boolean }) {
  const dispatch = useAppDispatch();
  const sets = useAppSelector(selectOrchestrasList);
  const status = useAppSelector(selectOrchestrasListStatus);
  const error = useAppSelector(selectOrchestrasListError);

  useEffect(() => {
    if (opts?.auto !== false) dispatch(fetchOrchestras());
  }, [dispatch, opts?.auto]);

  return {
    sets,
    status,
    error,
    reload: () => dispatch(fetchOrchestras({ force: true })),
  };
}
