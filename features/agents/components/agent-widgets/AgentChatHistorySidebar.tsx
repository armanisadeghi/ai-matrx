"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, MessageSquare, AlertCircle } from "lucide-react";
import { selectInstanceAgentId } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { fetchAgentConversations } from "@/features/agents/redux/conversation-list/conversation-list.thunks";
import { makeSelectAgentConversations } from "@/features/agents/redux/conversation-list/conversation-list.selectors";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import { ItemRow } from "@/components/official/item/ItemRow";
import { buildConversationMenu } from "@/features/agents/components/conversation-actions/conversationActionRegistry";
import { renameConversation } from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";
import type { AppDispatch } from "@/lib/redux/store";

interface AgentChatHistorySidebarProps {
  conversationId: string;
}

export function AgentChatHistorySidebar({
  conversationId,
}: AgentChatHistorySidebarProps) {
  const dispatch = useAppDispatch();
  const agentId = useAppSelector(selectInstanceAgentId(conversationId));

  const selectConversations = agentId
    ? makeSelectAgentConversations(agentId, null)
    : null;

  const { status, conversations, error } = useAppSelector((state) =>
    selectConversations
      ? selectConversations(state)
      : { status: "idle" as const, conversations: [], error: null },
  );

  useEffect(() => {
    if (!agentId) return;
    if (status === "idle") {
      dispatch(fetchAgentConversations({ agentId, versionFilter: null }));
    }
  }, [agentId, status, dispatch]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border/50 shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          History
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-1">
          {status === "loading" && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {status === "failed" && (
            <div className="flex flex-col items-center gap-2 py-8 px-3 text-center">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="text-xs text-muted-foreground">
                {error ?? "Failed to load"}
              </span>
            </div>
          )}

          {(status === "succeeded" || status === "idle") &&
            conversations.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 px-3 text-center">
                <MessageSquare className="h-4 w-4 text-muted-foreground/50" />
                <span className="text-xs text-muted-foreground">
                  No conversations yet
                </span>
              </div>
            )}

          {agentId &&
            conversations.map((conv) => (
              <ConversationRow
                key={conv.conversationId}
                conv={conv}
                agentId={agentId}
                dispatch={dispatch}
              />
            ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function ConversationRow({
  conv,
  agentId,
  dispatch,
}: {
  conv: ConversationListItem;
  agentId: string;
  dispatch: AppDispatch;
}) {
  const date = conv.updatedAt
    ? new Date(conv.updatedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;
  const href = `/agents/${agentId}/run?conversationId=${conv.conversationId}`;
  const secondary = [`${conv.messageCount} msg`, date].filter(Boolean).join(" · ");

  return (
    <ItemRow
      className="mx-1"
      size="sm"
      label={conv.title || "Untitled"}
      secondaryLabel={secondary || undefined}
      href={href}
      menu={() =>
        buildConversationMenu({
          conversationId: conv.conversationId,
          title: conv.title,
          isFavorite: conv.isFavorite ?? false,
          isArchived: conv.status === "archived",
          excludeFromKg: conv.excludeFromKg ?? false,
          isOwner: true,
          href,
          dispatch,
        })
      }
      rename={{
        value: conv.title ?? "",
        emptyFallback: "Untitled",
        onCommit: (next) =>
          void dispatch(
            renameConversation({
              conversationId: conv.conversationId,
              title: next,
            }),
          ),
      }}
    />
  );
}
