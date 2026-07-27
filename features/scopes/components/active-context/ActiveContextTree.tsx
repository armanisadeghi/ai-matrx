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
// scope, one project, one task. In a conversation host, context-item checks
// are exact lazy attachments in the existing per-conversation context payload.
//
// WRITE PATH: applyDenseSelectionToRedux → setFullContext without
// conversation_id. Clear is soft (keeps personal org + conversation).

import { useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import {
  selectActiveScopeTypeIds,
  selectOrganizationId,
  selectProjectId,
  selectScopeSelectionsContext,
  selectTaskId,
} from "@/lib/redux/slices/appContextSlice";
import { selectHasActiveContext } from "@/features/scopes/redux/selectors/active-context";
import { selectInstanceContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.selectors";
import {
  removeContextEntry,
  setContextEntry,
} from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { cn } from "@/lib/utils";
import { ContextTree } from "./context-tree/ContextTree";
import { useContextTreeData } from "./context-tree/shared";
import {
  applyDenseSelectionToRedux,
  clearWorkingContext,
  denseSelectionFromRedux,
} from "./context-tree/applyDenseSelection";
import type { DenseSelection } from "./context-tree/model";
import {
  attachedScopeContextItemRef,
  attachedScopeContextItemRefs,
  buildScopeContextItemAttachment,
} from "./scopeContextItemAttachment";

export interface ActiveContextTreeProps {
  className?: string;
  /** Tree viewport height in px. Default 260. */
  maxHeight?: number;
  showSearch?: boolean;
  /** Required when checked fields must be attached to an agent request. */
  conversationId?: string;
}

export function ActiveContextTree({
  className,
  maxHeight = 260,
  showSearch = true,
  conversationId,
}: ActiveContextTreeProps) {
  const dispatch = useAppDispatch();
  const data = useContextTreeData();

  const organizationId = useAppSelector(selectOrganizationId);
  const scopeSelections = useAppSelector(selectScopeSelectionsContext);
  const activeScopeTypeIds = useAppSelector(selectActiveScopeTypeIds);
  const projectId = useAppSelector(selectProjectId);
  const taskId = useAppSelector(selectTaskId);
  const hasActiveContext = useAppSelector(selectHasActiveContext);

  const contextEntries = useAppSelector(
    selectInstanceContextEntries(conversationId ?? ""),
  );
  const persistedItemRefs = attachedScopeContextItemRefs(contextEntries);
  // Non-agent hosts still get local tree selection. Conversation hosts use
  // instanceContext as the sole source of truth so closing the popover cannot
  // destroy an explicit attachment.
  const [localItemRefs, setLocalItemRefs] = useState<string[]>([]);
  const itemRefs = conversationId ? persistedItemRefs : localItemRefs;

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
    if (conversationId) {
      const previous = new Set(persistedItemRefs);
      const selected = new Set(next.itemRefs);

      for (const entry of contextEntries) {
        const ref = attachedScopeContextItemRef(entry);
        if (ref && !selected.has(ref)) {
          dispatch(removeContextEntry({ conversationId, key: entry.key }));
        }
      }
      for (const ref of next.itemRefs) {
        if (previous.has(ref)) continue;
        const attachment = buildScopeContextItemAttachment(
          ref,
          data.organizations,
          data.itemsByType,
        );
        if (!attachment) {
          console.error(
            `[active-context] selected field ${ref} could not be resolved into a request attachment`,
          );
          toast.error("Couldn't attach that context field");
          continue;
        }
        dispatch(
          setContextEntry({
            conversationId,
            key: attachment.key,
            value: attachment.value,
            type: "text",
            label: attachment.label,
          }),
        );
      }
    } else {
      setLocalItemRefs(next.itemRefs);
    }
    applyDenseSelectionToRedux(
      dispatch,
      next,
      data.organizations,
      data.projects,
      data.tasks,
    );
  };

  const handleClear = () => {
    if (conversationId) {
      for (const entry of contextEntries) {
        if (attachedScopeContextItemRef(entry)) {
          dispatch(removeContextEntry({ conversationId, key: entry.key }));
        }
      }
    } else {
      setLocalItemRefs([]);
    }
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
