// features/start/widgets/defaultDoc.ts — THE FIRST-VISIT LAYOUT: the normal app first (the counts strip, tasks,
// today, recent conversations, favorites, pinned agents), then the person's old start data page, if any.
import type { StartDoc } from "./types";

export function defaultStartDoc(startPageId: string | null): StartDoc {
  const widgets: StartDoc["widgets"] = [
    { id: "w_kpis", type: "kpis", size: "l", config: { keys: "agents,conversations,knowledge_files,published_apps,notes,tasks" } },
    { id: "w_tasks", type: "tasks", size: "m", config: {} },
    { id: "w_agenda", type: "agenda", size: "m", config: {} },
    { id: "w_recent_chats", type: "recent", size: "m", config: { kind: "conversation" } },
    { id: "w_favorites", type: "favorites", size: "s", config: {} },
    { id: "w_agents", type: "agents", size: "s", config: {} },
  ];
  if (startPageId) widgets.push({ id: "w_page", type: "page", size: "l", config: { pageId: startPageId } });
  return { schema: 1, widgets };
}
