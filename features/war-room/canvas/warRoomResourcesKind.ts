"use client";

/**
 * A war room's or a thread's resources as a canvas tab — the canonical
 * resources views (`ThreadResourcesTab` for a thread, `WarRoomResourcesList`
 * over the room adapter for the whole room), beside the room. ONE tab per
 * container (`war-room-resources`, keyed `thread:<id>` / `room:<id>`); a
 * thread's paperclip toggles its tab (pressed while in front), the room's
 * "Room resources…" opens the room's.
 */

import { Paperclip } from "lucide-react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { defineCanvasKind, type AnyCanvasKind } from "@ai-matrx/canvas/react";
import { canvasText, type ToolToggleInput } from "@/features/canvas/host/toolCanvas";

export const WAR_ROOM_RESOURCES_KIND = "war-room-resources";

export interface WarRoomResourcesTab {
  scope: "room" | "thread";
  id: string;
}

export function readWarRoomResourcesTab(data: CanvasJson | undefined | null): WarRoomResourcesTab | null {
  const scope = canvasText(data, "scope");
  const id = canvasText(data, "id");
  if (!id || (scope !== "room" && scope !== "thread")) return null;
  return { scope, id };
}

export function threadResourcesToggleInput(threadId: string, threadTitle: string | null | undefined): ToolToggleInput {
  const name = threadTitle?.trim();
  return {
    kind: WAR_ROOM_RESOURCES_KIND,
    key: `thread:${threadId}`,
    title: name ? `Resources · ${name}` : "Thread resources",
    data: { scope: "thread", id: threadId },
  };
}

export function roomResourcesOpenInput(sessionId: string, roomTitle?: string | null) {
  const name = roomTitle?.trim();
  return {
    kind: WAR_ROOM_RESOURCES_KIND,
    key: `room:${sessionId}`,
    // Names its room — two rooms' resource tabs never share a title.
    title: name ? `Resources · ${name}` : "Room resources",
    data: { scope: "room", id: sessionId },
  };
}

export const WAR_ROOM_RESOURCES_CANVAS_KIND: AnyCanvasKind = defineCanvasKind<CanvasJson>({
  id: WAR_ROOM_RESOURCES_KIND,
  surface: "dom",
  label: "Resources",
  icon: Paperclip,
  load: () => import("./WarRoomResourcesCanvasView"),
  unavailable: (data) => (readWarRoomResourcesTab(data) ? null : "No room"),
  // The room's state is loaded by its page; the tab belongs to that visit.
  restore: false,
});
