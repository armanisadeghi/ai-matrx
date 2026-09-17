"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { AppDispatch } from "@/lib/redux/store";
import type { RootState } from "@/lib/redux/store";
import { clearFocus } from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.slice";
import { resolveMandate } from "@/features/mandates/service";
import {
  bumpFreshSession,
  stageDraftHandoff,
} from "@/features/agents/redux/chat/chat-route.slice";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "./chat-quick-actions.config";

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
  if (
    convMatch &&
    convMatch[1] !== "new" &&
    convMatch[1] !== "message-templates" &&
    convMatch[1] !== "voice"
  ) {
    return { activeConversationId: convMatch[1], activeAgentId: undefined };
  }
  return { activeConversationId: null, activeAgentId: undefined };
}

/** Agent that owns the current chat route — for routing + to `+` on the right
 *  fresh surface. `/chat/new` belongs to the `chat.default_new_chat` mandate, so
 *  the caller supplies that mandate's resolved agent (`defaultAgentId`). */
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

/**
 * THE ONE chat-route surface key. Every chat surface — the room client that
 * REGISTERS the focus entry, the header picker that reads a draft off it, the
 * `/chat/new` landing, and `beginFreshChat`'s stale-focus clear — must derive
 * it from here.
 *
 * It is `chat:<agentId>` because that is what `ChatRoomClient` has always
 * registered (`sourceFeature` "chat" + agent id). Three call sites hand-built
 * `chat-route:<agentId>` instead — the SourceFeature literal `"chat-route"`
 * used by the context-menu props, which is a different axis entirely. Every one
 * of those lookups missed silently: `beginFreshChat` cleared nothing, and the
 * header's agent switch read an empty draft and so stashed NOTHING, which is
 * why switching agents mid-typing destroyed the text (FOUND_DEFECTS D60).
 * A miss here can never throw — it just returns undefined — so never inline
 * this string again.
 */
export function chatRouteSurfaceKey(agentId: string): string {
  return `chat:${agentId}`;
}

/**
 * The only same-tab agent-switch door. The transaction keeps only instance
 * identities in memory; the destination copies the canonical live draft after
 * it initializes. Modifier-click/new-tab callers must not invoke this helper.
 */
export function stageChatAgentSwitch({
  dispatch,
  router,
  getState,
  targetAgentId,
  sourceAgentId,
  sourceConversationId,
  href = `/chat/a/${encodeURIComponent(targetAgentId)}`,
}: {
  dispatch: AppDispatch;
  router: AppRouterInstance;
  getState: () => RootState;
  targetAgentId: string;
  sourceAgentId?: string;
  sourceConversationId?: string | null;
  href?: string;
}): void {
  const state = getState();
  const sourceSurfaceKey = sourceAgentId
    ? chatRouteSurfaceKey(sourceAgentId)
    : state.conversationFocus.lastSurfaceKey?.startsWith("chat:")
      ? state.conversationFocus.lastSurfaceKey
      : null;
  const sourceFocus = sourceSurfaceKey
    ? state.conversationFocus.bySurface[sourceSurfaceKey]
    : undefined;
  const resolvedSourceConversationId =
    sourceConversationId ?? sourceFocus?.input ?? sourceFocus?.display ?? null;
  if (resolvedSourceConversationId) {
    dispatch(
      stageDraftHandoff({
        sourceConversationId: resolvedSourceConversationId,
        targetAgentId,
      }),
    );
  }
  router.push(href);
}

/** Catch package-owned chat links before they bypass the same-tab handoff. */
export function interceptChatAgentLink(
  event: ReactMouseEvent<HTMLElement>,
  args: Omit<
    Parameters<typeof stageChatAgentSwitch>[0],
    "targetAgentId" | "href"
  >,
): void {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey
  ) {
    return;
  }
  const target = event.target;
  if (!(target instanceof Element)) return;
  const href = target.closest("a[href]")?.getAttribute("href");
  const match = href?.match(/^\/chat\/a\/([^/?#]+)\/?(?:[?#].*)?$/);
  if (!href || !match) return;
  if (event.shiftKey || event.altKey) {
    // The package handles only cmd/ctrl itself. Stop its target handler while
    // preserving the anchor's native modifier navigation.
    event.stopPropagation();
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  stageChatAgentSwitch({
    ...args,
    targetAgentId: decodeURIComponent(match[1]),
    href,
  });
}

/** Start a brand-new chat: drop stale surface focus, bump the fresh-session
 *  nonce (so `/chat/new` remints even when the path is unchanged), navigate.
 *
 *  Authenticated users resolve `chat.default_new_chat` first (cached; the
 *  user's own binding wins) so "am I on the default agent" compares against
 *  what the mandate ACTUALLY resolves to. Guests have no admitted workspace,
 *  so the organization-scoped mandate cannot truthfully resolve for them: keep
 *  their known route agent, or navigate to `/chat/new`, without making the
 *  doomed request and emitting a false system error. */
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
  const state = getState();
  let defaultAgentId: string | null = null;
  if (state.userAuth.id !== null && !state.userAuth.isAnonymous) {
    try {
      defaultAgentId = (await resolveMandate(DEFAULT_NEW_CHAT_MANDATE_KEY))
        .agentId;
    } catch (error) {
      console.error(
        `[beginFreshChat] mandate "${DEFAULT_NEW_CHAT_MANDATE_KEY}" failed to resolve — routing to /chat/new, which will surface the error:`,
        error,
      );
    }
  }
  const activeAgentId = resolveActiveChatAgentId(
    pathname,
    state,
    defaultAgentId,
  );
  const targetAgentId = activeAgentId ?? defaultAgentId;
  if (targetAgentId) {
    dispatch(clearFocus(chatRouteSurfaceKey(targetAgentId)));
  }
  dispatch(bumpFreshSession());
  router.push(getFreshChatHref(activeAgentId, defaultAgentId));
}
