"use client";

// features/war-room/components/room/RoomAgentWindow.tsx
//
// Lazy boundary for the room agent's floating window. It owns the static
// `WindowPanel` import so that — and the 100+ lazy window-panel chunks it
// transitively references — NEVER ship in the /war-room/[id] route bundle.
//
// WarRoomShell loads THIS via next/dynamic(ssr:false). Statically importing
// WindowPanel from the shell (which is in the route's boot graph) trips the
// window-panels bundle-leak guard. See features/window-panels/FEATURE.md →
// "Bundle invariant".

import { Bot } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import RoomAgentPanel from "./RoomAgentPanel";

// Docked bottom-right on open (computed from the viewport in `initialRect`).
const ROOM_AGENT_W = 460;
const ROOM_AGENT_H = 620;

export default function RoomAgentWindow({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  return (
    <WindowPanel
      id={`war-room-room-agent-${sessionId}`}
      title="Room Agent"
      titleNode={
        <span className="flex items-center gap-1.5 min-w-0">
          <Bot className="size-3.5 shrink-0 text-primary" />
          <span className="truncate">Room Agent</span>
        </span>
      }
      onClose={onClose}
      width={ROOM_AGENT_W}
      height={ROOM_AGENT_H}
      minWidth={360}
      minHeight={420}
      initialRect={{
        x: Math.max(16, window.innerWidth - ROOM_AGENT_W - 24),
        y: Math.max(16, window.innerHeight - ROOM_AGENT_H - 24),
      }}
      bodyClassName="p-0"
    >
      <RoomAgentPanel sessionId={sessionId} />
    </WindowPanel>
  );
}
