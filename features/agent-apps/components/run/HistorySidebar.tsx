"use client";

/**
 * HistorySidebar — past-runs list for the /agent-apps/[id]/run page.
 *
 * Lists conversations bound to this app's agent (via the existing
 * `get_agent_conversations` RPC), filtered to runs that originated
 * from an agent-app surface (`sourceFeature === 'agent-app'`). Click
 * a row → loadConversation → the focused conversation on the app's
 * surface flips, the shell reads the new conversationId, and
 * MarkdownStream replays the messages. Continuing the conversation
 * is then automatic — Smart Input's submit dispatches the next turn
 * against the same conversationId.
 *
 * Apps that pin a specific agent version filter their history by
 * version too; "use latest" apps span every version of the agent.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, MessageSquare, Plus, X } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchAgentConversations } from "@/features/agents/redux/conversation-list/conversation-list.thunks";
import { makeSelectAgentConversationList } from "@/features/agents/redux/conversation-list/conversation-list.selectors";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";

interface HistorySidebarProps {
  /** App's agent (used to scope which conversations to fetch). */
  agentId: string;
  /** Pinned version number (when not using latest) — used to filter the RPC. */
  versionFilter?: number | null;
  /** Surface key the app's launcher uses; loadConversation focuses here. */
  surfaceKey: string;
  /** The currently focused conversation; highlighted in the list. */
  activeConversationId?: string | null;
  /** "New run" handler — usually clears focus / resets the surface. */
  onNewRun?: () => void;
  /** Hide the sidebar (mobile / collapsed). */
  hidden?: boolean;
  onClose?: () => void;
}

export function HistorySidebar({
  agentId,
  versionFilter = null,
  surfaceKey,
  activeConversationId,
  onNewRun,
  hidden,
  onClose,
}: HistorySidebarProps) {
  const dispatch = useAppDispatch();
  const selector = useMemo(
    () => makeSelectAgentConversationList(agentId, versionFilter),
    [agentId, versionFilter],
  );
  const { conversations, status } = useAppSelector(selector);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) return;
    if (status === "loading" || status === "succeeded") return;
    void dispatch(
      fetchAgentConversations({ agentId, versionFilter }),
    ).catch(() => {
      // Errors land in the slice; nothing else to do here.
    });
  }, [agentId, versionFilter, status, dispatch]);

  // Filter to agent-app conversations only. Other surfaces using the same
  // agent (the editor's chat panel, shortcuts, etc.) shouldn't pollute the
  // app's history view.
  const items = useMemo(
    () =>
      conversations.filter(
        (c) => c.sourceFeature === "agent-app" || c.sourceFeature === null,
      ),
    [conversations],
  );

  const handleSelect = async (conversationId: string) => {
    if (conversationId === activeConversationId) return;
    setLoadingId(conversationId);
    try {
      await dispatch(loadConversation({ conversationId, surfaceKey })).unwrap();
    } finally {
      setLoadingId(null);
    }
  };

  if (hidden) return null;

  return (
    <aside className="w-64 flex-shrink-0 h-full flex flex-col border-r border-border bg-card">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60">
        <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          History
        </span>
        <div className="flex items-center gap-1">
          {onNewRun && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onNewRun}
              title="New run"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          )}
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 lg:hidden"
              onClick={onClose}
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {status === "loading" && items.length === 0 && (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading…
          </div>
        )}
        {status === "succeeded" && items.length === 0 && (
          <div className="px-3 py-6 text-xs text-muted-foreground text-center">
            No past runs yet.
          </div>
        )}
        <ul className="py-1">
          {items.map((item) => {
            const isActive = item.conversationId === activeConversationId;
            const isLoading = loadingId === item.conversationId;
            return (
              <li key={item.conversationId}>
                <button
                  type="button"
                  onClick={() => handleSelect(item.conversationId)}
                  className={cn(
                    "w-full text-left px-3 py-2 hover:bg-accent transition-colors",
                    "flex items-start gap-2 text-xs",
                    isActive && "bg-accent",
                  )}
                  disabled={isLoading}
                >
                  <MessageSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-foreground line-clamp-1">
                      {item.title || "Untitled run"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatRelative(item.updatedAt)}
                      {item.messageCount > 0 && ` · ${item.messageCount} msg`}
                    </div>
                  </div>
                  {isLoading && (
                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
