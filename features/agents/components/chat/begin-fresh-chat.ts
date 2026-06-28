"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { AppDispatch } from "@/lib/redux/store";
import type { RootState } from "@/lib/redux/store";
import { clearFocus } from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.slice";
import { bumpFreshSession } from "./chat-route.slice";
import { DEFAULT_NEW_CHAT_AGENT_ID } from "./chat-quick-actions.config";

/** Derive the active conversation + active agent from the chat URL. */
export function parseChatPath(pathname: string): {
  activeConversationId: string | null;
  activeAgentId: string | undefined;
} {
  const agentMatch = pathname.match(/^\/chat\/a\/([^/]+)/);
  if (agentMatch) {
    return {
      activeConversationId: null,
      activeAgentId: decodeURIComponent(agentMatch[1]),
    };
  }
  const convMatch = pathname.match(/^\/chat\/([^/]+)$/);
  if (convMatch && convMatch[1] !== "new") {
    return { activeConversationId: convMatch[1], activeAgentId: undefined };
  }
  return { activeConversationId: null, activeAgentId: undefined };
}

/** Agent that owns the current chat route — for routing + to `+` on the right
 *  fresh surface. */
export function resolveActiveChatAgentId(
  pathname: string,
  state: RootState,
): string | undefined {
  const { activeConversationId, activeAgentId } = parseChatPath(pathname);
  if (activeAgentId) return activeAgentId;
  if (activeConversationId) {
    return (
      state.conversations.byConversationId[activeConversationId]?.agentId ??
      undefined
    );
  }
  if (pathname === "/chat/new") {
    return DEFAULT_NEW_CHAT_AGENT_ID;
  }
  return undefined;
}

/** Fresh-chat destination: default agent → landing (`/chat/new`), else agent
 *  route (no greeting chips). */
export function getFreshChatHref(activeAgentId: string | undefined): string {
  if (!activeAgentId || activeAgentId === DEFAULT_NEW_CHAT_AGENT_ID) {
    return "/chat/new";
  }
  return `/chat/a/${encodeURIComponent(activeAgentId)}`;
}

export function chatRouteSurfaceKey(agentId: string): string {
  return `chat-route:${agentId}`;
}

/** Start a brand-new chat: drop stale surface focus, bump the fresh-session
 *  nonce (so `/chat/new` remints even when the path is unchanged), navigate. */
export function beginFreshChat({
  dispatch,
  router,
  pathname,
  getState,
}: {
  dispatch: AppDispatch;
  router: AppRouterInstance;
  pathname: string;
  getState: () => RootState;
}): void {
  const activeAgentId = resolveActiveChatAgentId(pathname, getState());
  const targetAgentId = activeAgentId ?? DEFAULT_NEW_CHAT_AGENT_ID;
  dispatch(clearFocus(chatRouteSurfaceKey(targetAgentId)));
  dispatch(bumpFreshSession());
  router.push(getFreshChatHref(activeAgentId));
}
