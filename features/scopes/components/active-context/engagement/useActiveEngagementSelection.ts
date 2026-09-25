"use client";

// features/scopes/components/active-context/engagement/useActiveEngagementSelection.ts
//
// Surface A: the global working context (appContextSlice) as an
// EngagementSelection, for an EngagementPicker whose picks ARE the active
// context (the research start form, the tasks header). Lives under
// active-context/** — the one tree allowed to write appContextSlice.
// It replaced agent-context's useHierarchyReduxBridge (2026-09-25).
//
// Writes are surgical and in rung order: organization (which clears every
// rung under it, by the slice's own rule), then scope adds/removes (MULTI-SCOPE,
// additive — never a wholesale replace, never radio; Arman, 2026-07-07),
// then project, then task. One pick may move several rungs at once (a
// project of another organization moves the organization too).

import { useCallback, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  addActiveScope,
  clearContext,
  removeActiveScope,
  selectAppContext,
  setOrganization,
  setProject,
  setTask,
} from "@/lib/redux/slices/appContextSlice";
import type { EngagementSelection } from "../quick-pick/engine";

export function useActiveEngagementSelection(): {
  value: EngagementSelection;
  onChange: (next: EngagementSelection) => void;
} {
  const dispatch = useAppDispatch();
  const ctx = useAppSelector(selectAppContext);

  const value = useMemo<EngagementSelection>(
    () => ({
      organizationId: ctx.organization_id,
      organizationName: ctx.organization_name ?? null,
      projectId: ctx.project_id,
      projectName: ctx.project_name ?? null,
      taskId: ctx.task_id,
      taskName: ctx.task_name ?? null,
      scopeIds: Object.values(ctx.scope_selections ?? {}).filter(
        (id): id is string => Boolean(id),
      ),
    }),
    [ctx],
  );

  const onChange = useCallback(
    (next: EngagementSelection) => {
      const cleared =
        !next.organizationId &&
        !next.projectId &&
        !next.taskId &&
        next.scopeIds.length === 0;
      if (cleared) {
        dispatch(clearContext());
        return;
      }
      // After an organization change the slice holds no scopes, project or
      // task, so every lower rung below is compared against empty.
      const orgChanged = next.organizationId !== value.organizationId;
      if (orgChanged) {
        dispatch(
          setOrganization({
            id: next.organizationId,
            name: next.organizationName,
          }),
        );
      }
      const current = new Set(orgChanged ? [] : value.scopeIds);
      const incoming = new Set(next.scopeIds);
      for (const id of incoming) if (!current.has(id)) dispatch(addActiveScope(id));
      for (const id of current) if (!incoming.has(id)) dispatch(removeActiveScope(id));
      const projectBefore = orgChanged ? null : value.projectId;
      const taskBefore = orgChanged || next.projectId !== projectBefore ? null : value.taskId;
      if (next.projectId !== projectBefore) {
        dispatch(setProject({ id: next.projectId, name: next.projectName }));
      }
      if (next.taskId !== taskBefore) {
        dispatch(setTask({ id: next.taskId, name: next.taskName }));
      }
    },
    [dispatch, value],
  );

  return { value, onChange };
}
