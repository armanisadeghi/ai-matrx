"use client";

import { useMemo } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectProjectId,
  selectTaskId,
} from "@/lib/redux/slices/appContextSlice";
import { selectViewScope } from "../redux/ui/slice";
import type { Scope } from "../types";

export interface ViewScopeResult {
  scope: Scope;
  scopeId: string | null;
}

/**
 * Reads the window's current view scope from Redux and resolves the concrete
 * scopeId from appContext (the canonical scope source for the app). Anything
 * in this window that needs to make a scoped query calls this hook.
 *
 * No React Context — state lives entirely in Redux.
 */
export function useViewScope(): ViewScopeResult {
  const scope = useAppSelector(selectViewScope);
  const organizationId = useAppSelector(selectOrganizationId);
  const projectId = useAppSelector(selectProjectId);
  const taskId = useAppSelector(selectTaskId);
  return useMemo(() => {
    let scopeId: string | null = null;
    if (scope === "organization") scopeId = organizationId;
    else if (scope === "project") scopeId = projectId;
    else if (scope === "task") scopeId = taskId;
    return { scope, scopeId };
  }, [scope, organizationId, projectId, taskId]);
}
