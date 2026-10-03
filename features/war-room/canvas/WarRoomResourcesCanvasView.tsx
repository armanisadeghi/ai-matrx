"use client";

/** The body of a war-room-resources canvas tab: the room's or thread's canonical resources view. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { WarRoomResourcesList } from "@/features/war-room/components/resources/WarRoomResourcesList";
import { ThreadResourcesTab } from "@/features/war-room/components/thread/ThreadResourcesTab";
import { useRoomResourcesAdapter } from "@/features/war-room/hooks/useThreadResourcesAdapter";
import { readWarRoomResourcesTab } from "./warRoomResourcesKind";

function RoomResources({ sessionId }: { sessionId: string }) {
  const adapter = useRoomResourcesAdapter(sessionId);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-1">
      <WarRoomResourcesList adapter={adapter} variant="full" containerKind="room" scopeKey={sessionId} />
    </div>
  );
}

export default function WarRoomResourcesCanvasView({ data }: CanvasKindProps) {
  const tab = readWarRoomResourcesTab(data);
  if (!tab) return null;
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {tab.scope === "room" ? <RoomResources sessionId={tab.id} /> : <ThreadResourcesTab threadId={tab.id} />}
    </div>
  );
}
