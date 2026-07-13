"use client";

// Canonical hook for every "pick the global active organization" surface
// (user-menu org section, header reminder popover, etc.). Reads active org
// from appContextSlice, lists orgs from the scope tree (Redux — same source
// as ActiveContextPanel), and writes via chooseActiveOrganization.

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectOrganizationName,
  selectShouldPromptForOrganization,
} from "@/lib/redux/slices/appContextSlice";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";
import { chooseActiveOrganization } from "@/lib/redux/thunks/activeOrgBootstrap";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import { useDefaultOrganization } from "./useDefaultOrganization";

export function useActiveOrganizationPicker() {
  const dispatch = useAppDispatch();
  const activeOrgId = useAppSelector(selectOrganizationId);
  const activeOrgName = useAppSelector(selectOrganizationName);
  const promptForOrg = useAppSelector(selectShouldPromptForOrganization);
  const { organizations, status } = useScopeTree();
  const { isDefault } = useDefaultOrganization();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  useEffect(() => {
    // Gate on auth: ensureScopeTree no-ops (and stays 'idle') until a user id
    // exists, so we only fire once authenticated. Depending on isAuthenticated
    // means this re-fires when auth hydrates async on (public) routes
    // (usePublicAuthSync lands ~100ms after mount) — without it, the org
    // picker on a public route would stay empty for a logged-in user.
    if (!isAuthenticated) return;
    void dispatch(ensureScopeTree({}));
  }, [dispatch, isAuthenticated]);

  const selectOrganization = (id: string, name: string) => {
    dispatch(chooseActiveOrganization({ id, name }));
  };

  return {
    activeOrgId,
    activeOrgName,
    promptForOrg,
    organizations,
    loading: status === "idle" || status === "loading",
    loadFailed: status === "error",
    isDefault,
    selectOrganization,
  };
}
