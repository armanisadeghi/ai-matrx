// features/scopes/hooks/useScopeTree.ts
//
// Public hook for reading the scope tree. Most consumers should reach for
// this rather than wiring `useSelector(makeSelectOrganizationsList)` by
// hand. Returns a stable shape — refreshes via `refresh()` follow the
// no-refetch policy (only fires if you ask).

"use client";

import { useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationsList,
  selectTreeError,
  selectTreeFetchedAt,
  selectTreeStatus,
} from "@/features/scopes/redux/selectors/tree";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import type { OrgNode } from "@/features/scopes/types";

export interface UseScopeTreeReturn {
  organizations: OrgNode[];
  status: ReturnType<typeof selectTreeStatus>;
  error: string | null;
  fetchedAt: number | null;
  refresh: () => Promise<void>;
}

export function useScopeTree(): UseScopeTreeReturn {
  const dispatch = useAppDispatch();
  const organizations = useAppSelector(selectOrganizationsList);
  const status = useAppSelector(selectTreeStatus);
  const error = useAppSelector(selectTreeError);
  const fetchedAt = useAppSelector(selectTreeFetchedAt);

  return useMemo(
    () => ({
      organizations,
      status,
      error,
      fetchedAt,
      refresh: () => dispatch(ensureScopeTree({ refresh: true })),
    }),
    [organizations, status, error, fetchedAt, dispatch],
  );
}
