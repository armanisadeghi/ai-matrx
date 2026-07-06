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

  useEffect(() => {
    void dispatch(ensureScopeTree({}));
  }, [dispatch]);

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
