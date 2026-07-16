"use client";

// features/scopes/components/active-context/ActiveContextTree.tsx
//
// THE canonical COMPACT Surface-A active-context picker — the promoted dense
// ContextTree, wired to appContextSlice. Drop it into popovers/menus
// (ContextDocsMenu, ActiveContextLensChip, PlusAttachMenu fold-in). Prefer
// ActiveContextPanel where there's real vertical room.
//
// ADD IS ADDITIVE: selecting a node never strips other dimensions (picking a
// project must not drop scopes). Cascade-up only ADDS ancestors. Explicit
// uncheck is the only remove path. Production cardinality: one org, multi-
// scope, one project, one task. Context-item checks are session-local.
//
// WRITE PATH: applyDenseSelectionToRedux → setFullContext without
// conversation_id. Clear is soft (keeps personal org + conversation).

import { useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectActiveScopeTypeIds,
  selectOrganizationId,
  selectProjectId,
  selectScopeSelectionsContext,
  selectTaskId,
} from "@/lib/redux/slices/appContextSlice";
import { selectHasActiveContext } from "@/features/scopes/redux/selectors/active-context";
import { cn } from "@/lib/utils";
import { ContextTree } from "./context-tree/ContextTree";
import { useContextTreeData } from "./context-tree/shared";
import {
  applyDenseSelectionToRedux,
  clearWorkingContext,
  denseSelectionFromRedux,
} from "./context-tree/applyDenseSelection";
import type { DenseSelection } from "./context-tree/model";

export interface ActiveContextTreeProps {
  className?: string;
  /** Tree viewport height in px. Default 260. */
  maxHeight?: number;
  showSearch?: boolean;
}

export function ActiveContextTree({
  className,
  maxHeight = 260,
  showSearch = true,
}: ActiveContextTreeProps) {
  const dispatch = useAppDispatch();
  const data = useContextTreeData();

  const organizationId = useAppSelector(selectOrganizationId);
  const scopeSelections = useAppSelector(selectScopeSelectionsContext);
  const activeScopeTypeIds = useAppSelector(selectActiveScopeTypeIds);
  const projectId = useAppSelector(selectProjectId);
  const taskId = useAppSelector(selectTaskId);
  const hasActiveContext = useAppSelector(selectHasActiveContext);

  // Item checks aren't on the slice — keep them for the open session so the
  // cascade-up to scope/type/org still feels sticky in the tree.
  const [itemRefs, setItemRefs] = useState<string[]>([]);

  const selection = useMemo(
    () =>
      denseSelectionFromRedux({
        organizationId,
        scopeSelections,
        activeScopeTypeIds,
        projectId,
        taskId,
        organizations: data.organizations,
        itemRefs,
      }),
    [
      organizationId,
      scopeSelections,
      activeScopeTypeIds,
      projectId,
      taskId,
      data.organizations,
      itemRefs,
    ],
  );

  const handleChange = (next: DenseSelection) => {
    setItemRefs(next.itemRefs);
    applyDenseSelectionToRedux(
      dispatch,
      next,
      data.organizations,
      data.projects,
      data.tasks,
    );
  };

  const handleClear = () => {
    setItemRefs([]);
    clearWorkingContext(dispatch);
  };

  return (
    <ContextTree
      data={data}
      selection={selection}
      onChange={handleChange}
      onClear={
        hasActiveContext || itemRefs.length > 0 ? handleClear : undefined
      }
      height={maxHeight}
      showSearch={showSearch}
      allowCreate={false}
      className={cn("border-0 bg-transparent shadow-none", className)}
    />
  );
}
