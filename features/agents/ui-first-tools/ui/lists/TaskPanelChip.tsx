"use client";

/**
 * TaskPanelChip — small chip in the chat header that shows the active
 * conversation's plan/task/todo counts. Click to open the TaskPanel drawer.
 *
 * Hidden when the conversation has no plan/tasks/todos (zero pixel
 * footprint). Subscribes to the agentLists slice; when the agent calls
 * `tasks` or `update_plan` or `user_todos`, the chip auto-appears.
 *
 * Also hydrates + subscribes to Supabase Realtime on mount, so the chip
 * shows correct counts even if the user reloaded the page mid-conversation.
 */

import { useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectHasAgentListsContent,
  selectAgentTaskCounts,
  selectUserTodoCounts,
} from "../../redux/agent-lists.selectors";
import {
  hydrateAgentLists,
  subscribeAgentLists,
  unsubscribeAgentLists,
} from "../../redux/agent-lists.thunks";
import { cn } from "@/lib/utils";
import { TaskPanel } from "./TaskPanel";

interface TaskPanelChipProps {
  conversationId: string;
  className?: string;
}

export function TaskPanelChip({
  conversationId,
  className,
}: TaskPanelChipProps) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const hasContent = useAppSelector(selectHasAgentListsContent(conversationId));
  const taskCounts = useAppSelector(selectAgentTaskCounts(conversationId));
  const todoCounts = useAppSelector(selectUserTodoCounts(conversationId));

  // Hydrate + subscribe to realtime whenever we have a real conversationId.
  // Doing this in the chip (rather than the page) means every chat surface
  // that mounts the chip automatically gets the live mirror — no manual
  // wire-up in each page.
  useEffect(() => {
    if (!conversationId) return undefined;
    void dispatch(hydrateAgentLists(conversationId));
    dispatch(subscribeAgentLists(conversationId));
    return () => {
      dispatch(unsubscribeAgentLists(conversationId));
    };
  }, [conversationId, dispatch]);

  if (!hasContent) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md",
          "bg-card hover:bg-muted text-muted-foreground hover:text-foreground",
          "border border-border transition-colors",
          className,
        )}
        title="Open agent lists panel"
      >
        <ListChecks className="w-3.5 h-3.5" />
        <span>
          {taskCounts.done}/{taskCounts.total}
        </span>
        {todoCounts.open > 0 && (
          <span className="ml-1 px-1 rounded bg-primary/10 text-primary">
            {todoCounts.open}
          </span>
        )}
      </button>
      <TaskPanel
        conversationId={conversationId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
