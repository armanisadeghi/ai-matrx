"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { AppDispatch } from "@/lib/redux/store";
import type { RootState } from "@/lib/redux/store";
import { clearFocus } from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.slice";
import { resolveAgentSlot } from "@/features/agents/slots/service";
import { bumpFreshSession } from "./chat-route.slice";
import { DEFAULT_NEW_CHAT_SLOT_KEY } from "./chat-quick-actions.config";

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
 *  fresh surface. `/chat/new` belongs to the `chat.default_new_chat` slot, so
 *  the caller supplies that slot's resolved agent (`defaultAgentId`). */
export function resolveActiveChatAgentId(
  pathname: string,
  state: RootState,
  defaultAgentId: string | null,
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
    return defaultAgentId ?? undefined;
  }
  return undefined;
}

/** Fresh-chat destination: default agent → landing (`/chat/new`), else agent
 *  route (no greeting chips). */
export function getFreshChatHref(
  activeAgentId: string | undefined,
  defaultAgentId: string | null,
): string {
  if (!activeAgentId || activeAgentId === defaultAgentId) {
    return "/chat/new";
  }
  return `/chat/a/${encodeURIComponent(activeAgentId)}`;
}

export function chatRouteSurfaceKey(agentId: string): string {
  return `chat-route:${agentId}`;
}

/** Start a brand-new chat: drop stale surface focus, bump the fresh-session
 *  nonce (so `/chat/new` remints even when the path is unchanged), navigate.
 *
 *  Resolves the `chat.default_new_chat` slot first (cached; the user's own
 *  binding wins) so "am I on the default agent" compares against what the
 *  slot ACTUALLY resolves to. Resolution failure is loud but never blocks the
 *  navigation — `/chat/new` surfaces the resolution error itself. */
export async function beginFreshChat({
  dispatch,
  router,
  pathname,
  getState,
}: {
  dispatch: AppDispatch;
  router: AppRouterInstance;
  pathname: string;
  getState: () => RootState;
}): Promise<void> {
  let defaultAgentId: string | null = null;
  try {
    defaultAgentId = (await resolveAgentSlot(DEFAULT_NEW_CHAT_SLOT_KEY)).agentId;
  } catch (error) {
    console.error(
      `[beginFreshChat] slot "${DEFAULT_NEW_CHAT_SLOT_KEY}" failed to resolve — routing to /chat/new, which will surface the error:`,
      error,
    );
  }
  const activeAgentId = resolveActiveChatAgentId(
    pathname,
    getState(),
    defaultAgentId,
  );
  const targetAgentId = activeAgentId ?? defaultAgentId;
  if (targetAgentId) {
    dispatch(clearFocus(chatRouteSurfaceKey(targetAgentId)));
  }
  dispatch(bumpFreshSession());
  router.push(getFreshChatHref(activeAgentId, defaultAgentId));
}
