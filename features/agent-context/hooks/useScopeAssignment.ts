"use client";

import { useState, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchScopeTypes } from "../redux/scope/scopeTypesSlice";
import { fetchScopes } from "../redux/scope/scopesSlice";
import {
  setEntityScopes,
  fetchEntityScopes,
} from "../redux/scope/scopeAssignmentsSlice";
import { selectScopePickerOptions } from "../redux/scope/selectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";

/**
 * Hook for managing scope assignments during entity creation.
 *
 * Usage in a form:
 * 1. Call `useScopeAssignment("project")` at the top of your component
 * 2. Render `<ScopePicker orgId={orgId} entityType="project" entityId="" onChange={onScopeChange} />`
 *    or use `pendingScopeIds` + your own UI
 * 3. After entity creation succeeds, call `assignScopes(newEntityId)`
 */
export function useScopeAssignment(entityType: string) {
  const dispatch = useAppDispatch();
  const orgId = useAppSelector(selectOrganizationId);
  const [pendingScopeIds, setPendingScopeIds] = useState<string[]>([]);

  const onScopeChange = useCallback((scopeIds: string[]) => {
    setPendingScopeIds(scopeIds);
  }, []);

  const assignScopes = useCallback(
    async (entityId: string) => {
      if (pendingScopeIds.length === 0) return;
      try {
        await dispatch(
          setEntityScopes({
            entity_type: entityType,
            entity_id: entityId,
            scope_ids: pendingScopeIds,
          }),
        ).unwrap();
      } catch (err) {
        console.error(
          `[useScopeAssignment] Failed to assign scopes to ${entityType}:${entityId}`,
          err,
        );
      }
    },
    [dispatch, entityType, pendingScopeIds],
  );

  return {
    orgId,
    pendingScopeIds,
    onScopeChange,
    assignScopes,
  };
}
