"use client";

import { useCallback, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
// Canonical Surface A redux bridge — dispatches active-context writes for the
// global hierarchy pickers (ContextSwitcherWindow, TaskContentNew).
// Classified "Surface-A writer — correct, not a bug" in
// features/window-panels/docs/inventory/context-scopes.md.
// Scope writes are ADDITIVE (addActiveScope/removeActiveScope) — MULTI-SCOPE
// by law (Arman, 2026-07-07); never a wholesale replace, never radio.
// eslint-disable-next-line no-restricted-syntax -- Surface A: canonical global-context bridge
import {
  selectAppContext,
  setOrganization,
  addActiveScope,
  removeActiveScope,
  setProject,
  setTask,
  clearContext,
} from "@/lib/redux/slices/appContextSlice";
import type { HierarchySelection } from "./types";
import { EMPTY_SELECTION } from "./types";

/**
 * Bridges HierarchySelection state to/from the global appContextSlice in Redux.
 * Use this when you need the selection to be global (affects sidebar, other features).
 *
 * Syncs the full hierarchy: org → scope_selections → project → task.
 * Returns { value, onChange } — pass directly to any HierarchySelection variant.
 */
export function useHierarchyReduxBridge() {
  const dispatch = useAppDispatch();
  const ctx = useAppSelector(selectAppContext);

  const value: HierarchySelection = useMemo(
    () => ({
      organizationId: ctx.organization_id,
      organizationName: ctx.organization_name ?? null,
      scopeSelections: ctx.scope_selections ?? {},
      projectId: ctx.project_id,
      projectName: ctx.project_name ?? null,
      taskId: ctx.task_id,
      taskName: ctx.task_name ?? null,
    }),
    [ctx],
  );

  const onChange = useCallback(
    (sel: HierarchySelection) => {
      if (sel.organizationId !== ctx.organization_id) {
        dispatch(
          setOrganization({
            id: sel.organizationId,
            name: sel.organizationName,
          }),
        );
        return;
      }

      // Diff scope ids and dispatch surgical adds/removes — the additive
      // multi-scope actions never evict same-type siblings.
      const incomingScopes = sel.scopeSelections ?? {};
      const currentScopes = ctx.scope_selections ?? {};
      const incomingIds = new Set(
        Object.values(incomingScopes).filter((v): v is string => !!v),
      );
      const currentIds = new Set(
        Object.values(currentScopes).filter((v): v is string => !!v),
      );
      let scopesChanged = false;
      for (const id of incomingIds) {
        if (!currentIds.has(id)) {
          dispatch(addActiveScope(id));
          scopesChanged = true;
        }
      }
      for (const id of currentIds) {
        if (!incomingIds.has(id)) {
          dispatch(removeActiveScope(id));
          scopesChanged = true;
        }
      }
      if (scopesChanged) return;

      if (sel.projectId !== ctx.project_id) {
        dispatch(setProject({ id: sel.projectId, name: sel.projectName }));
        return;
      }

      if (sel.taskId !== ctx.task_id) {
        dispatch(setTask({ id: sel.taskId, name: sel.taskName }));
        return;
      }

      if (
        !sel.organizationId &&
        !sel.projectId &&
        !sel.taskId &&
        Object.keys(incomingScopes).length === 0
      ) {
        dispatch(clearContext());
      }
    },
    [
      dispatch,
      ctx.organization_id,
      ctx.scope_selections,
      ctx.project_id,
      ctx.task_id,
    ],
  );

  return { value, onChange };
}
