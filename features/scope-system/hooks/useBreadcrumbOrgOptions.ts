"use client";

import { useEffect, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAllOrgs } from "@/features/agent-context/redux/organizationsSlice";
import { fetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";
import {
  orgScopesHref,
  scopeSeg,
} from "@/features/scope-system/utils/scopeRoutes";
import type { ScopeCrumbOption } from "@/features/scope-system/components/ScopeBreadcrumb";

/**
 * Sibling-org options for the breadcrumb org switcher. Each option points at the
 * target org's scopes hub — the only level that exists across every org, since
 * scope-type / scope / item ids are org-specific and never carry over.
 *
 * Self-sources the org list from Redux and lazily triggers a full-context fetch
 * when the list is empty (e.g. deep-linking straight into a scope route before
 * the sidebar has hydrated the org list).
 */
export function useBreadcrumbOrgOptions(
  currentOrgSlugOrId: string,
): ScopeCrumbOption[] {
  const dispatch = useAppDispatch();
  const orgs = useAppSelector(selectAllOrgs);

  useEffect(() => {
    if (orgs.length === 0) {
      dispatch(fetchFullContext());
    }
  }, [dispatch, orgs.length]);

  return useMemo(
    () =>
      orgs.map((org) => ({
        label: org.is_personal ? "Personal workspace" : org.name,
        href: orgScopesHref(scopeSeg(org)),
        active:
          org.id === currentOrgSlugOrId || org.slug === currentOrgSlugOrId,
      })),
    [orgs, currentOrgSlugOrId],
  );
}
