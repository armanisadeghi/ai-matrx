"use client";

/**
 * "Continue in new chat" on a comment thread: an agent takes the thread over.
 * One door — `openNewChatAbout` with the thread: the root comment's id, its
 * words and every reply so far, handed to the agent that replied in the thread
 * (else the conversation's agent, else the default new-chat agent) and sent at
 * once. The agent's replies there land in THIS thread (same comment id).
 *
 * Rendered only inside an open menu, so the router and the store are read only
 * when the person is about to use them.
 */

import { MessageSquarePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useContext } from "react";
import { ReactReduxContext } from "react-redux";
import { openNewChatAbout, type NewChatThread } from "@ai-matrx/chat/agents/components/chat/new-chat-about";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/slices/userSlice";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { toast } from "@/lib/toast";
import type { AnnotationSource, ResolvedItem } from "./types";

/** The thread as the new chat receives it. */
export function threadOfItem(item: ResolvedItem, source: AnnotationSource): NewChatThread | null {
  if (!item.commentId || item.saveState !== "confirmed") return null;
  return {
    rootCommentId: item.commentId,
    messageId: source.token === "message" ? source.id : null,
    conversationId: source.conversationId ?? null,
    quote: item.anchor?.exact ?? null,
    body: item.body,
    replies: item.replies.map((reply) => ({
      authorName: reply.author.agent ? reply.author.agent.name : reply.mine ? "You" : reply.author.name,
      authorKind: reply.author.agent ? ("agent" as const) : ("person" as const),
      body: reply.body,
      createdAt: reply.createdAt,
    })),
  };
}

/** The agent that replied last in the thread, else null. */
export function replyingAgentOf(item: ResolvedItem): string | null {
  for (let i = item.replies.length - 1; i >= 0; i -= 1) {
    const agentId = item.replies[i]?.author.agent?.id;
    if (agentId) return agentId;
  }
  return item.author.agent?.id ?? null;
}

export function ContinueInNewChatItem({ item, source }: { item: ResolvedItem; source: AnnotationSource }) {
  // A host with no app store (an isolated preview) cannot start a chat: the row is absent there.
  if (!useContext(ReactReduxContext)) return null;
  return <ContinueInNewChatRow item={item} source={source} />;
}

function ContinueInNewChatRow({ item, source }: { item: ResolvedItem; source: AnnotationSource }) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const organizationId = useAppSelector(selectOrganizationId);
  const thread = threadOfItem(item, source);
  if (!thread) return null;
  return (
    <DropdownMenuItem
      onSelect={() => {
        const conversations = (store.getState() as { conversations?: { byConversationId?: Record<string, { agentId?: string | null }> } })
          .conversations?.byConversationId;
        const agentId =
          replyingAgentOf(item) ?? (source.conversationId ? (conversations?.[source.conversationId]?.agentId ?? null) : null);
        openNewChatAbout({
          thread,
          agentId,
          identity: { userId: userId ?? null, organizationId: organizationId ?? null },
          dispatch,
          navigate: (href) => startTransition(() => router.push(href)),
        }).catch((error: unknown) => {
          console.error("[annotations] Continue in new chat could not open:", error);
          toast.error("The new chat could not open. Try again.");
        });
      }}
    >
      <MessageSquarePlus className="mr-2 h-3.5 w-3.5" aria-hidden />
      Continue in new chat
    </DropdownMenuItem>
  );
}
