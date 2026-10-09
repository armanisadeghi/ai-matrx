"use client";

/**
 * A room's Group Chat inspector as a canvas tab (`group-chat-inspector`, keyed
 * `<anchor_type>:<anchor_id>`) — beside the room, never a floating panel. The
 * room header's toggle opens it; the body is `GroupChatInspector`.
 */

import { Users } from "lucide-react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { defineCanvasKind, type AnyCanvasKind } from "@ai-matrx/canvas/react";
import { canvasText, type ToolToggleInput } from "@/features/canvas/host/toolCanvas";

export const GROUP_CHAT_INSPECTOR_KIND = "group-chat-inspector";

export interface GroupChatInspectorTab {
  anchorType: string;
  anchorId: string;
  /** The participant to show first (the room's active expert). */
  focusKey: string | null;
}

export function readGroupChatInspectorTab(data: CanvasJson | undefined | null): GroupChatInspectorTab | null {
  const anchorType = canvasText(data, "anchorType");
  const anchorId = canvasText(data, "anchorId");
  if (!anchorType || !anchorId) return null;
  return { anchorType, anchorId, focusKey: canvasText(data, "focusKey") };
}

export function groupChatInspectorToggleInput(tab: GroupChatInspectorTab): ToolToggleInput {
  return {
    kind: GROUP_CHAT_INSPECTOR_KIND,
    key: `${tab.anchorType}:${tab.anchorId}`,
    title: "Group chat",
    data: { anchorType: tab.anchorType, anchorId: tab.anchorId, focusKey: tab.focusKey },
  };
}

export const GROUP_CHAT_INSPECTOR_CANVAS_KIND: AnyCanvasKind = defineCanvasKind<CanvasJson>({
  id: GROUP_CHAT_INSPECTOR_KIND,
  surface: "dom",
  label: "Group chat",
  icon: Users,
  load: () => import("./GroupChatInspectorCanvasView"),
  unavailable: (data) => (readGroupChatInspectorTab(data) ? null : "No room"),
  // The room's state is loaded by its page; the tab belongs to that visit.
  restore: false,
});
