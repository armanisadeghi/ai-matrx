"use client";

/**
 * Quick Chat as a canvas tab. The body is the chat package's QuickChatSheet —
 * the same `AgentConversationColumn` + launcher + reopen sequence `/chat` runs
 * — with its controls (conversation history, new chat) in the tab header.
 *
 * Identity: "default" for the everyday Quick Chat; a conversation handed off
 * by another composer (the ambient assistant) opens under its own id. The
 * tab's data remembers the conversation on screen, so a reload brings it back.
 */

import { ExternalLink, MessageSquare, MessageSquarePlus, PanelLeft } from "lucide-react";
import { TapTargetButtonTransparent } from "@ai-matrx/design-system/tap-target";
import { defineCanvasKind, type CanvasKindProps, type CanvasMenuItem } from "@ai-matrx/canvas/react";
import type { CanvasController, CanvasItemId, CanvasJson } from "@ai-matrx/canvas";
import { canvasRecord, canvasText, useToolOpener, type ToolOpenInput } from "@/features/canvas/host/toolCanvas";

export const QUICK_CHAT_KIND = "quick-chat";
const TITLE = "Quick Chat";

export interface QuickChatTabData {
  conversationId: string | null;
  agentId: string | null;
  /** The conversation history column is open. */
  history: boolean;
  /** Bumped by the header's New chat button. */
  newChat: number;
  [key: string]: CanvasJson;
}

export function readQuickChatData(data: CanvasJson | undefined | null): QuickChatTabData {
  const record = canvasRecord(data);
  return {
    conversationId: canvasText(data, "conversationId"),
    agentId: canvasText(data, "agentId"),
    history: record.history === true,
    newChat: typeof record.newChat === "number" ? record.newChat : 0,
  };
}

export function freshQuickChatData(conversationId: string | null): QuickChatTabData {
  return { conversationId, agentId: null, history: false, newChat: 0 };
}

/** Writes the tab's data from its latest state, never a stale render's copy. */
export function patchQuickChatData(
  canvas: CanvasController,
  itemId: CanvasItemId,
  patch: { conversationId?: string | null; agentId?: string | null; history?: boolean; newChat?: number },
) {
  const current = readQuickChatData(canvas.getState().items[itemId]?.data);
  const next = { ...current, ...patch };
  if (
    current.conversationId === next.conversationId &&
    current.agentId === next.agentId &&
    current.history === next.history &&
    current.newChat === next.newChat
  ) {
    return;
  }
  canvas.update(itemId, { data: next });
}

function QuickChatHeaderAction({ item, data, canvas }: CanvasKindProps) {
  const tab = readQuickChatData(data);
  return (
    <>
      <TapTargetButtonTransparent
        ariaLabel={tab.history ? "Hide conversations" : "Conversations"}
        icon={<PanelLeft className={tab.history ? "h-4 w-4 text-primary" : "h-4 w-4"} />}
        onClick={() => patchQuickChatData(canvas, item.id, { history: !tab.history })}
      />
      <TapTargetButtonTransparent
        ariaLabel="New chat"
        icon={<MessageSquarePlus className="h-4 w-4" />}
        onClick={() => patchQuickChatData(canvas, item.id, { newChat: tab.newChat + 1 })}
      />
    </>
  );
}

function quickChatMenu({ data }: CanvasKindProps): readonly CanvasMenuItem[] {
  const { conversationId } = readQuickChatData(data);
  if (!conversationId) return [];
  return [
    {
      id: "open-chat-page",
      label: "Open in Chat",
      icon: <ExternalLink />,
      onSelect: () => window.open(`/chat/${conversationId}`, "_blank", "noopener"),
    },
  ];
}

export const quickChatKind = defineCanvasKind<QuickChatTabData>({
  id: QUICK_CHAT_KIND,
  surface: "dom",
  label: TITLE,
  icon: MessageSquare,
  load: () => import("./QuickChatCanvasView"),
  restore: true,
  launcher: { key: "default", data: freshQuickChatData(null), title: TITLE },
  HeaderAction: QuickChatHeaderAction,
  menuItems: quickChatMenu,
});

export interface OpenQuickChatOptions {
  /** A live conversation handed off by another composer — opens as its own tab. */
  initialConversationId?: string;
  /** Tab title; "Quick Chat" when omitted. */
  title?: string;
}

/** The open request for a Quick Chat tab (also used by the chat host's windows port). */
export function quickChatOpenInput(options: OpenQuickChatOptions = {}): ToolOpenInput {
  return {
    kind: QUICK_CHAT_KIND,
    key: options.initialConversationId ?? "default",
    title: options.title ?? TITLE,
    data: freshQuickChatData(options.initialConversationId ?? null),
  };
}

/** Opens Quick Chat in the canvas (or focuses the tab that already shows it). */
export function useOpenQuickChat() {
  const open = useToolOpener(quickChatOpenInput);
  return (options: OpenQuickChatOptions = {}) => open(options);
}
