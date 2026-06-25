"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
// Surface A: the /agent-context pages' working-scope navigator, dual-sourced
// URL <-> appContext. Explicit active-context selection — never entity tagging.
// eslint-disable-next-line no-restricted-syntax -- Surface A: agent-context working-scope navigator
import {
  selectOrganizationId,
  selectProjectId,
  selectTaskId,
  setOrganization,
  setProject,
  setTask,
  setFullContext,
} from "@/lib/redux/slices/appContextSlice";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import type { ContextScopeLevel } from "../types";

export type ScopeState = {
  scopeType: ContextScopeLevel;
  scopeId: string;
  scopeName: string;
  scopeTypeId?: string;
  scopeColor?: string;
  scopeIcon?: string;
};

const DEFAULT_SCOPE: ScopeState = {
  scopeType: "user",
  scopeId: "default",
  scopeName: "My Context",
};

/**
 * Unified scope hook — dual-source pattern.
 *
 * 1. URL params are the primary source for the context feature pages.
 * 2. Redux appContextSlice is the app-wide single source of truth.
 *
 * On mount: if Redux has a scope set and URL doesn't, seed URL from Redux.
 * On setScope: writes to both URL and Redux simultaneously.
 */
export function useContextScope(): {
  scope: ScopeState;
  setScope: (scope: ScopeState) => void;
  scopeLabel: string;
  hierarchy: {
    userId: string | null;
    organizationId: string | null;
    projectId: string | null;
    taskId: string | null;
  };
} {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useAppDispatch();

  const userId = useAppSelector(selectUserId);
  const reduxOrgId = useAppSelector(selectOrganizationId);
  const reduxProjectId = useAppSelector(selectProjectId);
  const reduxTaskId = useAppSelector(selectTaskId);

  const urlScopeType = searchParams.get(
    "scopeType",
  ) as ContextScopeLevel | null;
  const urlScopeId = searchParams.get("scopeId");
  const urlScopeName = searchParams.get("scopeName");
  const urlScopeTypeId = searchParams.get("scopeTypeId");
  const urlScopeColor = searchParams.get("scopeColor");
  const urlScopeIcon = searchParams.get("scopeIcon");

  let scope: ScopeState;
  if (urlScopeType && urlScopeId) {
    scope = {
      scopeType: urlScopeType,
      scopeId: urlScopeId,
      scopeName: urlScopeName || DEFAULT_SCOPE.scopeName,
      ...(urlScopeType === "scope" && {
        scopeTypeId: urlScopeTypeId || undefined,
        scopeColor: urlScopeColor || undefined,
        scopeIcon: urlScopeIcon || undefined,
      }),
    };
  } else if (reduxTaskId) {
    scope = { scopeType: "task", scopeId: reduxTaskId, scopeName: "Task" };
  } else if (reduxProjectId) {
    scope = {
      scopeType: "project",
      scopeId: reduxProjectId,
      scopeName: "Project",
    };
  } else if (reduxOrgId) {
    scope = {
      scopeType: "organization",
      scopeId: reduxOrgId,
      scopeName: "Organization",
    };
  } else if (userId) {
    scope = { scopeType: "user", scopeId: userId, scopeName: "My Context" };
  } else {
    scope = DEFAULT_SCOPE;
  }

  useEffect(() => {
    if (!urlScopeType || !urlScopeId) return;

    if (urlScopeType === "scope") return;

    const reduxUpdate: Record<string, string | null> = {
      organization_id: null,
      project_id: null,
      task_id: null,
    };

    switch (urlScopeType) {
      case "task":
        reduxUpdate.task_id = urlScopeId;
        break;
      case "project":
        reduxUpdate.project_id = urlScopeId;
        break;
      case "organization":
        reduxUpdate.organization_id = urlScopeId;
        break;
    }

    dispatch(setFullContext(reduxUpdate));
  }, [urlScopeType, urlScopeId, dispatch]);

  const setScope = useCallback(
    (newScope: ScopeState) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("scopeType", newScope.scopeType);
      params.set("scopeId", newScope.scopeId);
      params.set("scopeName", newScope.scopeName);

      if (newScope.scopeType === "scope") {
        if (newScope.scopeTypeId)
          params.set("scopeTypeId", newScope.scopeTypeId);
        if (newScope.scopeColor) params.set("scopeColor", newScope.scopeColor);
        if (newScope.scopeIcon) params.set("scopeIcon", newScope.scopeIcon);
      } else {
        params.delete("scopeTypeId");
        params.delete("scopeColor");
        params.delete("scopeIcon");
      }

      router.replace(`${pathname}?${params.toString()}`, { scroll: false });

      switch (newScope.scopeType) {
        case "organization":
          dispatch(
            setOrganization({ id: newScope.scopeId, name: newScope.scopeName }),
          );
          break;
        case "project":
          dispatch(
            setProject({ id: newScope.scopeId, name: newScope.scopeName }),
          );
          break;
        case "task":
          dispatch(setTask({ id: newScope.scopeId, name: newScope.scopeName }));
          break;
        case "user":
          dispatch(setOrganization({ id: null }));
          break;
        case "scope":
          break;
      }
    },
    [router, pathname, searchParams, dispatch],
  );

  const scopeLabel =
    scope.scopeType === "user"
      ? "Personal"
      : scope.scopeType === "organization"
        ? "Organization"
        : scope.scopeType === "scope"
          ? scope.scopeName || "Scope"
          : scope.scopeType === "project"
            ? "Project"
            : "Task";

  const hierarchy = {
    userId,
    organizationId: reduxOrgId,
    projectId: reduxProjectId,
    taskId: reduxTaskId,
  };

  return { scope, setScope, scopeLabel, hierarchy };
}
