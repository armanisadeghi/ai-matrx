"use client";

/**
 * "This chat's documents" — the canvas launcher's door to the conversation the
 * person is in. Picking it resolves the current chat (the `/chat/<id>` route,
 * or the conversation `/chat/new` already reserved before its first turn),
 * turns on that conversation's working document, opens its ONE Documents tab
 * in this pane, and closes itself. Off a chat route it says so in one line.
 *
 * TODO(canvas 0.5.0): replace this kind with a contextual launcher entry
 * (`useCanvasLauncherEntry`) registered by the chat route, so it is offered
 * only while a chat is on screen; delete this file then.
 */

import { MessageSquareText } from "lucide-react";
import { defineCanvasKind } from "@ai-matrx/canvas/react";
import { parseChatPath } from "@ai-matrx/chat/agents/components/chat/begin-fresh-chat";
import { selectLastFocusedSurfaceKey } from "@ai-matrx/chat/agents/redux/execution-system/conversation-focus/conversation-focus.selectors";
import type { RootState } from "@/lib/redux/rootReducer";

export const CHAT_DOCUMENTS_LAUNCHER_KIND = "chat-documents";
const TITLE = "This chat's documents";

/** The chat route's page surface and its focus are keyed `chat:<agentId>`. */
const CHAT_SURFACE_PREFIX = "chat:";

/** The conversation the chat route is showing, or null off a chat route. */
export function resolveChatConversation(pathname: string, state: RootState): string | null {
  if (!pathname.startsWith("/chat")) return null;
  const fromRoute = parseChatPath(pathname).activeConversationId;
  if (fromRoute) return fromRoute;
  // `/chat/new` and `/chat/a/<agent>`: the conversation the MOUNTED chat page
  // reserved. A chat page registers itself as a `chat:<agentId>` surface while
  // it is on screen; the most recently focused one wins when several are.
  const mounted = Object.keys(state.surfaces?.byKey ?? {}).filter((key) => key.startsWith(CHAT_SURFACE_PREFIX));
  const last = selectLastFocusedSurfaceKey(state);
  const surfaceKey = last && mounted.includes(last) ? last : mounted[0];
  if (!surfaceKey) return null;
  return state.conversationFocus?.bySurface[surfaceKey]?.input ?? null;
}

export const chatDocumentsKind = defineCanvasKind<null>({
  id: CHAT_DOCUMENTS_LAUNCHER_KIND,
  label: TITLE,
  icon: MessageSquareText,
  load: () => import("./ChatDocumentsCanvasView"),
  // A door, not a place: it never comes back after a reload.
  restore: false,
  launcher: { key: "current", data: null, title: TITLE },
});
