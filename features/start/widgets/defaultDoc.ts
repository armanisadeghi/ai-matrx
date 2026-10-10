// features/start/widgets/defaultDoc.ts — THE FIRST-VISIT LAYOUT: the normal app first (four counts, tasks,
// today, recent conversations, favorites, pinned agents), then the person's old start data page, if any.
import type { StartDoc } from "./types";

export function defaultStartDoc(startPageId: string | null): StartDoc {
  const widgets: StartDoc["widgets"] = [
    { id: "w_metric_agents", type: "metric", size: "s", config: { metric: "agents" } },
    { id: "w_metric_conversations", type: "metric", size: "s", config: { metric: "conversations" } },
    { id: "w_metric_tasks", type: "metric", size: "s", config: { metric: "tasks" } },
    { id: "w_metric_notes", type: "metric", size: "s", config: { metric: "notes" } },
    { id: "w_tasks", type: "tasks", size: "m", config: {} },
    { id: "w_agenda", type: "agenda", size: "m", config: {} },
    { id: "w_recent_chats", type: "recent", size: "m", config: { kind: "conversation" } },
    { id: "w_favorites", type: "favorites", size: "s", config: {} },
    { id: "w_agents", type: "agents", size: "s", config: {} },
  ];
  if (startPageId) widgets.push({ id: "w_page", type: "page", size: "l", config: { pageId: startPageId } });
  return { schema: 1, widgets };
}
