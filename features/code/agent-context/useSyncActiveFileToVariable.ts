"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setHostVariableValues } from "@ai-matrx/chat/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { selectInstanceVariableDefinitions } from "@ai-matrx/chat/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { selectCodeTabs } from "../redux/tabsSlice";
import { isPreviewTab } from "../types";

/**
 * Fill a coding agent's named variable (e.g. `current_code`) with the file the
 * person has open — as a HOST variable, never as `user_input` (THE USER-INPUT
 * LAW: structured content is a named variable). A no-op when the focused
 * conversation's agent declares no variable of that name, so every other
 * coding agent is untouched. The open file is the active tab, or — when the
 * active tab is a preview — the most recent source tab.
 */
export function useSyncActiveFileToVariable(
  conversationId: string | null | undefined,
  variableName: string | undefined,
  debounceMs = 250,
): void {
  const dispatch = useAppDispatch();
  const content = useAppSelector((state) => {
    const tabs = selectCodeTabs(state);
    const active = tabs.activeId ? tabs.byId[tabs.activeId] : null;
    if (active && !isPreviewTab(active.kind)) return active.content;
    for (const id of tabs.recentTabIds ?? []) {
      const tab = tabs.byId[id];
      if (tab && !isPreviewTab(tab.kind)) return tab.content;
    }
    return null;
  });
  const declared = useAppSelector((state) =>
    conversationId && variableName
      ? selectInstanceVariableDefinitions(conversationId)(state).some((d) => d.name === variableName)
      : false,
  );

  useEffect(() => {
    if (!conversationId || !variableName || !declared || content == null) return undefined;
    const timer = setTimeout(() => {
      dispatch(setHostVariableValues({ conversationId, values: { [variableName]: content } }));
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [conversationId, variableName, declared, content, debounceMs, dispatch]);
}
