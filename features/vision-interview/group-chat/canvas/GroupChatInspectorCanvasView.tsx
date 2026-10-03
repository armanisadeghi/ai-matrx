"use client";

/** The body of a group-chat-inspector canvas tab. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { GroupChatInspector } from "../GroupChatInspector";
import { readGroupChatInspectorTab } from "./groupChatInspectorKind";

export default function GroupChatInspectorCanvasView({ data }: CanvasKindProps) {
  const tab = readGroupChatInspectorTab(data);
  if (!tab) return null;
  return <GroupChatInspector anchorType={tab.anchorType} anchorId={tab.anchorId} initialKey={tab.focusKey} />;
}
