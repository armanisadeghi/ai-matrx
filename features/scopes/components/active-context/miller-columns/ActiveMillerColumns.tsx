"use client";

import { useCallback, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectActiveScopeTypeIds,
  selectOrganizationId,
  selectProjectId,
  selectScopeSelectionsContext,
  selectTaskId,
} from "@/lib/redux/slices/appContextSlice";
import {
  applyDenseSelectionToRedux,
  clearWorkingContext,
  denseSelectionFromRedux,
} from "../context-tree/applyDenseSelection";
import {
  buildAncestryMap,
  isSelected,
  toggleNodeCascaded,
} from "../context-tree/model";
import {
  orgNodeOf,
  projectNodeOf,
  scopeNodeOf,
  taskNodeOf,
  typeNodeOf,
  useUniverse,
  type PickNode,
  type SelectionEngine,
} from "../quick-pick/engine";
import { MillerColumnsCore, type MillerColumnsVariant } from "./MillerColumns";

export interface ActiveMillerColumnsProps {
  variant?: MillerColumnsVariant;
  className?: string;
}

/** Surface-A adapter: the reusable Miller core backed by appContextSlice. */
export function ActiveMillerColumns({
  variant = "full",
  className,
}: ActiveMillerColumnsProps) {
  const dispatch = useAppDispatch();
  const universe = useUniverse();
  const organizationId = useAppSelector(selectOrganizationId);
  const scopeSelections = useAppSelector(selectScopeSelectionsContext);
  const activeScopeTypeIds = useAppSelector(selectActiveScopeTypeIds);
  const projectId = useAppSelector(selectProjectId);
  const taskId = useAppSelector(selectTaskId);
  const [itemNodes, setItemNodes] = useState<Map<string, PickNode>>(
    () => new Map(),
  );

  const selection = useMemo(
    () =>
      denseSelectionFromRedux({
        organizationId,
        scopeSelections,
        activeScopeTypeIds,
        projectId,
        taskId,
        organizations: universe.orgs,
        itemRefs: [...itemNodes.keys()],
      }),
    [
      organizationId,
      scopeSelections,
      activeScopeTypeIds,
      projectId,
      taskId,
      universe.orgs,
      itemNodes,
    ],
  );
  const ancestry = useMemo(
    () => buildAncestryMap(universe.orgs, universe.projects, universe.tasks),
    [universe.orgs, universe.projects, universe.tasks],
  );

  const nodes = useMemo(() => {
    const resolved: PickNode[] = [];
    const orgNameById = new Map(universe.orgs.map((org) => [org.id, org.name]));
    for (const org of universe.orgs) {
      if (selection.orgIds.includes(org.id)) resolved.push(orgNodeOf(org));
      for (const type of org.scope_types) {
        if (selection.scopeTypeIds.includes(type.id))
          resolved.push(typeNodeOf(org, type));
        for (const scope of type.scopes) {
          if (selection.scopeIds.includes(scope.id)) {
            resolved.push(scopeNodeOf(org, type, scope));
          }
        }
      }
    }
    const orgName = (id: string | null) =>
      id ? (orgNameById.get(id) ?? "Other org") : "Unassigned";
    for (const project of universe.projects) {
      if (selection.projectIds.includes(project.id)) {
        resolved.push(projectNodeOf(project, orgName));
      }
    }
    for (const task of universe.tasks) {
      if (selection.taskIds.includes(task.id)) {
        resolved.push(taskNodeOf(task, orgName));
      }
    }
    for (const ref of selection.itemRefs) {
      const node = itemNodes.get(ref);
      if (node) resolved.push(node);
    }
    return resolved;
  }, [selection, universe.orgs, universe.projects, universe.tasks, itemNodes]);

  const toggle = useCallback(
    (node: PickNode) => {
      const next = toggleNodeCascaded(
        selection,
        node.kind,
        node.id,
        "multi",
        ancestry,
      );
      setItemNodes((previous) => {
        const updated = new Map(previous);
        if (node.kind === "item" && next.itemRefs.includes(node.id)) {
          updated.set(node.id, node);
        }
        for (const ref of updated.keys()) {
          if (!next.itemRefs.includes(ref)) updated.delete(ref);
        }
        return updated;
      });
      applyDenseSelectionToRedux(
        dispatch,
        next,
        universe.orgs,
        universe.projects,
        universe.tasks,
      );
    },
    [
      selection,
      ancestry,
      dispatch,
      universe.orgs,
      universe.projects,
      universe.tasks,
    ],
  );
  const clear = useCallback(() => {
    setItemNodes(new Map());
    clearWorkingContext(dispatch);
  }, [dispatch]);

  const engine: SelectionEngine = useMemo(
    () => ({
      nodes,
      count: nodes.length,
      single: false,
      isOn: (kind, id) => isSelected(selection, kind, id),
      toggle,
      clear,
    }),
    [nodes, selection, toggle, clear],
  );

  return (
    <MillerColumnsCore
      universe={universe}
      engine={engine}
      mode="active"
      variant={variant}
      className={className}
    />
  );
}
