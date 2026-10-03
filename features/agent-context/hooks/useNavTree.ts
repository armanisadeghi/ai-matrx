"use client";

// features/context/hooks/useNavTree.ts
//
// Single hook for accessing the user hierarchy (orgs, projects, tasks, scopes).
// Backed by get_user_full_context — one RPC, cached in Redux, never re-fetched
// unless explicitly invalidated after a mutation.

import { useEffect, useMemo } from "react";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { onlyOpenOrganizations } from "@/features/organizations/organizationsToCreateIn";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectFullContext,
  selectFullContextStatus,
  selectFullContextError,
  selectNavOrganizations,
  selectFlatProjects,
  selectProjectsForOrg,
  type NavOrganization,
  type FlatProject,
} from "@/features/agent-context/redux/hierarchySlice";
import { fetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";

const EMPTY_NAV_ORGS: NavOrganization[] = [];
const EMPTY_FLAT_PROJECTS: FlatProject[] = [];

export function useNavTree() {
  const dispatch = useAppDispatch();
  const fullContext = useAppSelector(selectFullContext);
  const status = useAppSelector(selectFullContextStatus);
  const error = useAppSelector(selectFullContextError);
  const orgs = useAppSelector(selectNavOrganizations);
  const flatProjects = useAppSelector(selectFlatProjects);

  useEffect(() => {
    if (status === "idle") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dispatch(fetchFullContext() as any);
    }
  }, [dispatch, status]);

  return {
    /** @deprecated — use orgs + flatProjects directly */
    navTree: fullContext,
    orgs: orgs ?? EMPTY_NAV_ORGS,
    flatProjects: flatProjects ?? EMPTY_FLAT_PROJECTS,
    status,
    isLoading: status === "loading",
    isSuccess: status === "success",
    isError: status === "error",
    error,
    /** Selector helper: all projects for a given org */
    projectsForOrg: (orgId: string | null): FlatProject[] =>
      (flatProjects ?? EMPTY_FLAT_PROJECTS).filter((p) => p.org_id === orgId),
  };
}

/**
 * Convenience — just returns the list of orgs, triggering a fetch if needed.
 */
export function useNavOrganizations() {
  const { orgs, isLoading, isError } = useNavTree();
  return { orgs, isLoading, isError };
}

/**
 * Ensure the full hierarchy (orgs, projects, tasks, scopes) is loaded in Redux.
 *
 * This is the canonical "ensure loaded" hook for all agent-context data.
 * It is idempotent and safe to call from any number of components on the same page —
 * only one network request will ever fire per session. Call it at the top of any
 * component that reads from hierarchySlice, projectsSlice, tasksSlice, or scopeSlices.
 *
 * Returns { isLoading, isSuccess, isError } so callers can show skeletons while
 * the initial fetch is in flight.
 *
 * Because DeferredSingletons also dispatches fetchFullContext() on every authenticated
 * page load, most of the time this hook finds data already present and returns
 * isSuccess: true immediately with zero network cost.
 */
export function useEnsureHierarchyLoaded() {
  const { isLoading, isSuccess, isError, error } = useNavTree();
  return { isLoading, isSuccess, isError, error };
}

/**
 * The organizations a create/target picker may offer: the nav tree's organizations minus
 * archived ones. Nothing is offered until the open-membership list is known, so an archived
 * organization never flashes into a picker.
 */
export function useOrganizationsToCreateIn() {
  const { orgs, isLoading } = useNavTree();
  const { organizations: open, loading: openLoading } = useUserOrganizations();
  const offered = useMemo(
    () =>
      openLoading
        ? EMPTY_NAV_ORGS
        : onlyOpenOrganizations(orgs, new Set(open.map((o) => o.id))),
    [orgs, open, openLoading],
  );
  return { orgs: offered, isLoading: isLoading || openLoading };
}
