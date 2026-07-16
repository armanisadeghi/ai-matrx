"use client";

// features/scopes/components/active-context/ActiveContextPanel.tsx
//
// Inline Surface-A working-context editor — the same field + dispatch wiring
// as ActiveContextButton's popover, without the trigger chrome. Use inside
// tab panels (RunControlsMenu), drawers, or any host that already provides
// the shell.
//
// WRITE PATH: setFullContext WITHOUT conversation_id (same contract as
// applyDenseSelectionToRedux). Never use setOrganization here — it cascade-
// clears conversation_id and breaks the chat route.

import { useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectScopeSelectionsContext,
  selectProjectId,
  selectTaskId,
  setFullContext,
} from "@/lib/redux/slices/appContextSlice";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import {
  ContextAssignmentField,
  type ContextCheckboxVariant,
  type ContextSelection,
} from "@/features/scopes/components/context-assignment/ContextAssignmentField";
import {
  fetchAssignableProjects,
  fetchAssignableTasks,
} from "@/features/scopes/components/context-assignment/data";
import { clearWorkingContext } from "./context-tree/applyDenseSelection";
import { cn } from "@/lib/utils";

export interface ActiveContextPanelProps {
  checkboxVariant?: ContextCheckboxVariant;
  sectionHeight?: number;
  /** Fill the host height (bottom sheet / drawer) instead of a fixed section
   *  height — single scroll area, pinned footer. Default false. */
  fill?: boolean;
  className?: string;
}

export function ActiveContextPanel({
  checkboxVariant = "standard",
  sectionHeight = 300,
  fill = false,
  className,
}: ActiveContextPanelProps) {
  const dispatch = useAppDispatch();
  const { organizations } = useScopeTree();

  const orgId = useAppSelector(selectOrganizationId);
  const scopeSelections = useAppSelector(selectScopeSelectionsContext);
  const projectId = useAppSelector(selectProjectId);
  const taskId = useAppSelector(selectTaskId);

  const scopeIds = useMemo(
    () => Object.values(scopeSelections).filter((v): v is string => !!v),
    [scopeSelections],
  );

  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [taskNames, setTaskNames] = useState<Record<string, string>>({});
  useEffect(() => {
    void fetchAssignableProjects().then((ps) =>
      setProjectNames(Object.fromEntries(ps.map((p) => [p.id, p.name]))),
    );
    void fetchAssignableTasks().then((ts) =>
      setTaskNames(Object.fromEntries(ts.map((t) => [t.id, t.title]))),
    );
  }, []);

  function apply(sel: ContextSelection) {
    const org = sel.organizationId
      ? organizations.find((o) => o.id === sel.organizationId)
      : null;
    const byScope: Record<string, string | null> = {};
    for (const sid of sel.scopeIds) byScope[sid] = sid;
    const pid = sel.projectIds[0] ?? null;
    const tid = sel.taskIds[0] ?? null;
    dispatch(
      setFullContext({
        organization_id: sel.organizationId,
        organization_name: org?.name ?? null,
        scope_selections: byScope,
        project_id: pid,
        project_name: pid ? (projectNames[pid] ?? null) : null,
        task_id: tid,
        task_name: tid ? (taskNames[tid] ?? null) : null,
        // conversation_id omitted — never wipe the chat pointer
      }),
    );
  }

  return (
    <ContextAssignmentField
      mode="active"
      hideSubject
      sectionHeight={sectionHeight}
      fill={fill}
      checkboxVariant={checkboxVariant}
      className={cn("border-0", className)}
      initialSelection={{
        organizationId: orgId,
        scopeIds,
        projectIds: projectId ? [projectId] : [],
        taskIds: taskId ? [taskId] : [],
      }}
      onApplyActive={apply}
      onClearActive={() => clearWorkingContext(dispatch)}
    />
  );
}
