"use client";

/** The body of a context-items canvas tab: the chat package's ContextItemViewer. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { ContextItemViewer } from "@ai-matrx/chat/agents/components/context-items/ContextItemViewer";
import { readContextItemsTab } from "@ai-matrx/chat/agents/components/context-items/contextItemsTab";
import { canvasRecord } from "@/features/canvas/host/toolCanvas";

export default function ContextItemsCanvasView({ data, item, canvas }: CanvasKindProps) {
  const { items, selected } = readContextItemsTab(data);
  if (items.length === 0) return null;
  const found = items.findIndex((candidate) => candidate.id === selected);
  const index = found < 0 ? 0 : found;
  return (
    <ContextItemViewer
      items={items}
      index={index}
      // The item on screen lives on the tab, so the chips' pressed state agrees.
      onIndexChange={(next) => {
        const target = items[next];
        if (!target) return;
        void canvas.update(item.id, {
          data: { ...canvasRecord(data), selected: target.id },
          title: target.title,
        });
      }}
      onTitleChange={(title) => {
        if (title && title !== item.title) void canvas.update(item.id, { title });
      }}
    />
  );
}
