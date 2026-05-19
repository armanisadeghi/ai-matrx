"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectGlobalConversationList,
  selectGlobalListStatus,
  selectLastUsedAgentId,
} from "@/features/agents/redux/conversation-list/conversation-list.selectors";
import { fetchGlobalConversations } from "@/features/agents/redux/conversation-list/conversation-list.thunks";

/**
 * Default `(a)/chat` landing. Fetches the user's most recent conversations
 * and routes through a smart fallback chain so power users land in their
 * last conversation, returning users land on their last agent, and brand-new
 * users land on the picker:
 *
 *   latest conversation → /chat/[conversationId]
 *   else last-used agent → /chat/a/[agentId]
 *   else                 → /chat/new
 */
export function ChatLandingClient() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const status = useAppSelector(selectGlobalListStatus);
  const conversations = useAppSelector(selectGlobalConversationList);
  const lastUsedAgentId = useAppSelector(selectLastUsedAgentId);
  const routedRef = useRef(false);

  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchGlobalConversations({ limit: 25 }));
    }
  }, [dispatch, status]);

  useEffect(() => {
    if (routedRef.current) return;
    if (status !== "succeeded" && status !== "failed") return;
    routedRef.current = true;
    if (conversations.length > 0) {
      router.replace(`/chat/${conversations[0].conversationId}`);
    } else if (lastUsedAgentId) {
      router.replace(`/chat/a/${lastUsedAgentId}`);
    } else {
      router.replace("/chat/new");
    }
  }, [status, conversations, lastUsedAgentId, router]);

  return (
    <div className="h-[calc(100dvh-var(--header-height,2.5rem))] flex items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin text-primary" />
      <span className="text-sm">Opening chat…</span>
    </div>
  );
}
