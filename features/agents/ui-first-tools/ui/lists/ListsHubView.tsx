"use client";

/**
 * ListsHubView — cross-conversation aggregate view of all plans / agent
 * tasks / user todos. Reads only from the local agentLists slice plus a
 * one-shot fetch on mount, so users can triage everything in one place.
 *
 * Reads happen on mount via a bulk Supabase query (one per table, all rows
 * the RLS-filtered user can see, grouped by conversation_id). Subscribes
 * to global realtime changes so new rows from any conversation appear.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { db } from "../../service/supabase-typed";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { cn } from "@/lib/utils";
import {
  upsertPlan,
  upsertTask,
  upsertUserTodo,
} from "../../redux/agent-lists.slice";
import { selectAllConversationLists } from "../../redux/agent-lists.selectors";
import type {
  CxAgentPlanRow,
  CxAgentTaskRow,
  CxUserTodoRow,
} from "../../tools/types";

interface ConversationRow {
  id: string;
  title: string | null;
}

export function ListsHubView() {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const buckets = useAppSelector(selectAllConversationLists);
  const [conversations, setConversations] = useState<
    Record<string, ConversationRow>
  >({});
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // One-shot bulk hydrate on mount for ALL conversations the user owns.
  // The chip auto-hydrates per-conversation, but the hub needs them all at
  // once even for conversations that haven't been visited yet this session.
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    void (async () => {
      const [plansR, tasksR, todosR] = await Promise.all([
        db
          .schema("chat").from("agent_plan")
          .select("*")
          .eq("user_id", userId)
          .neq("status", "superseded")
          .order("updated_at", { ascending: false })
          .limit(500),
        db
          .schema("chat").from("agent_task")
          .select("*")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(2000),
        db
          .schema("chat").from("user_todo")
          .select("*")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(2000),
      ]);
      if (cancelled) return;

      const convoIds = new Set<string>();
      for (const row of (plansR.data ?? []) as CxAgentPlanRow[]) {
        convoIds.add(row.conversation_id);
        dispatch(upsertPlan(row));
      }
      for (const row of (tasksR.data ?? []) as CxAgentTaskRow[]) {
        convoIds.add(row.conversation_id);
        dispatch(upsertTask(row));
      }
      for (const row of (todosR.data ?? []) as CxUserTodoRow[]) {
        convoIds.add(row.conversation_id);
        dispatch(upsertUserTodo(row));
      }

      if (convoIds.size > 0) {
        const { data: convos } = await supabase
          .schema("chat").from("conversation")
          .select("id, title")
          .in("id", Array.from(convoIds));
        if (cancelled) return;
        const m: Record<string, ConversationRow> = {};
        for (const c of (convos ?? []) as ConversationRow[]) {
          m[c.id] = c;
        }
        setConversations(m);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, dispatch]);

  const entries = Object.entries(buckets).filter(
    ([, b]) =>
      b.plan != null || b.tasks.length > 0 || b.userTodos.length > 0,
  );

  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden bg-textured">
      <header className="border-b border-border px-4 py-2.5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Agent lists</h1>
          <p className="text-xs text-muted-foreground">
            Plans, tasks, and todos from every conversation
          </p>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {!loaded && (
          <div className="text-sm text-muted-foreground italic">Loading…</div>
        )}
        {loaded && entries.length === 0 && (
          <div className="text-sm text-muted-foreground italic">
            No agent plans, tasks, or todos yet. Try asking an agent to
            create some.
          </div>
        )}
        {entries.map(([conversationId, bucket]) => {
          const isExpanded = expanded[conversationId] ?? true;
          const convo = conversations[conversationId];
          const taskOpen = bucket.tasks.filter((t) => t.status !== "done")
            .length;
          const taskDone = bucket.tasks.length - taskOpen;
          const todoOpen = bucket.userTodos.filter((t) => !t.done).length;
          return (
            <section
              key={conversationId}
              className="rounded-md border border-border bg-card"
            >
              <button
                type="button"
                onClick={() =>
                  setExpanded((s) => ({
                    ...s,
                    [conversationId]: !isExpanded,
                  }))
                }
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {convo?.title ?? `Conversation ${conversationId.slice(0, 8)}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {bucket.plan && `Plan (${bucket.plan.status})`}
                    {bucket.plan && (taskOpen > 0 || taskDone > 0 || todoOpen > 0) && " · "}
                    {(taskOpen > 0 || taskDone > 0) &&
                      `${taskDone}/${taskOpen + taskDone} tasks`}
                    {(taskOpen > 0 || taskDone > 0) && todoOpen > 0 && " · "}
                    {todoOpen > 0 && `${todoOpen} open todos`}
                  </div>
                </div>
                <Link
                  href={`/chat/${conversationId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-muted-foreground hover:text-foreground"
                  title="Open conversation"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </button>
              {isExpanded && (
                <div className="border-t border-border px-3 py-2 flex flex-col gap-2.5">
                  {bucket.plan && <HubPlan plan={bucket.plan} />}
                  {bucket.tasks.length > 0 && (
                    <HubTaskList tasks={bucket.tasks} />
                  )}
                  {bucket.userTodos.length > 0 && (
                    <HubTodoList todos={bucket.userTodos} />
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function HubPlan({ plan }: { plan: CxAgentPlanRow }) {
  return (
    <div className="rounded bg-muted/30 p-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
        Plan · {plan.status}
      </div>
      <div className="text-sm font-medium">{plan.title}</div>
      {plan.steps.length > 0 && (
        <ol className="list-decimal pl-5 mt-1 text-xs space-y-0.5">
          {plan.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

function HubTaskList({ tasks }: { tasks: CxAgentTaskRow[] }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
        Agent tasks
      </div>
      <ul className="flex flex-col gap-0.5">
        {tasks.map((t) => (
          <li
            key={t.id}
            className={cn(
              "text-sm",
              t.status === "done" && "text-muted-foreground line-through",
            )}
          >
            <span className="text-muted-foreground mr-1">[{t.status}]</span>
            {t.title}
          </li>
        ))}
      </ul>
    </div>
  );
}

function HubTodoList({ todos }: { todos: CxUserTodoRow[] }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
        Your todos
      </div>
      <ul className="flex flex-col gap-0.5">
        {todos.map((t) => (
          <li
            key={t.id}
            className={cn(
              "text-sm",
              t.done && "text-muted-foreground line-through",
            )}
          >
            {t.title}
            {t.due && !t.done && (
              <span className="text-xs text-muted-foreground ml-1">
                · due {t.due}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
