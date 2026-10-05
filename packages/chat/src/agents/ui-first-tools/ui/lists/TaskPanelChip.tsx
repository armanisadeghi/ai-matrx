"use client";

/**
 * TaskPanelChip — small chip in the chat header that shows the active
 * conversation's plan/task/todo counts. Click toggles the conversation's
 * agent lists tab in the canvas (TaskPanel is its body).
 *
 * Hidden when the conversation has no plan/tasks/todos (zero pixel
 * footprint). Subscribes to the agentLists slice; when the agent calls
 * `tasks` or `update_plan` or `user_todos`, the chip auto-appears.
 *
 * Also hydrates + subscribes to Supabase Realtime on mount, so the chip
 * shows correct counts even if the user reloaded the page mid-conversation.
 */

import { Chip } from "@ai-matrx/design-system/controls";
import { useEffect } from "react";
import { ListChecks } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../../../../store/hooks";
import {
  selectHasAgentListsContent,
  selectAgentTaskCounts,
  selectUserTodoCounts,
} from "../../redux/agent-lists.selectors";
import {
  ensureAgentLists,
  subscribeAgentLists,
  unsubscribeAgentLists,
} from "../../redux/agent-lists.thunks";
import { cn } from "@ai-matrx/design-system";
import { useConversationListsTab } from "./TaskPanel";

interface TaskPanelChipProps {
  conversationId: string;
  className?: string;
}

export function TaskPanelChip({
  conversationId,
  className,
}: TaskPanelChipProps) {
  const dispatch = useAppDispatch();
  const lists = useConversationListsTab(conversationId);
  const hasContent = useAppSelector(selectHasAgentListsContent(conversationId));
  const taskCounts = useAppSelector(selectAgentTaskCounts(conversationId));
  const todoCounts = useAppSelector(selectUserTodoCounts(conversationId));

  // Hydrate + subscribe to realtime whenever we have a real conversationId.
  // Doing this in the chip (rather than the page) means every chat surface
  // that mounts the chip automatically gets the live mirror — no manual
  // wire-up in each page.
  useEffect(() => {
    if (!conversationId) return undefined;
    void dispatch(ensureAgentLists(conversationId));
    dispatch(subscribeAgentLists(conversationId));
    return () => {
      dispatch(unsubscribeAgentLists(conversationId));
    };
  }, [conversationId, dispatch]);

  if (!hasContent) return null;

  return (
    <>
      <Chip
        asChild
        pressed={lists.isVisible}
        className={className}
        icon={<ListChecks />}
        label={`${taskCounts.done}/${taskCounts.total}${todoCounts.open > 0 ? ` · ${todoCounts.open} open` : ""}`}
        title="Open agent lists panel"
      >
        <button type="button" onClick={lists.toggle} />
      </Chip>
    </>
  );
}
