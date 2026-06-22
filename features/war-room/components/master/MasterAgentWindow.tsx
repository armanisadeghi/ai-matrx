"use client";

// features/war-room/components/master/MasterAgentWindow.tsx
//
// Lazy boundary for the master agent's floating window. It owns the static
// `WindowPanel` import so that — and the 100+ lazy window-panel chunks it
// transitively references — NEVER ship in the /war-room/all route bundle.
//
// WarRoomAllView loads THIS via next/dynamic(ssr:false). Statically importing
// WindowPanel from the view (which is in the route's boot graph) trips the
// window-panels bundle-leak guard. See features/window-panels/FEATURE.md →
// "Bundle invariant".

import { Radar } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import MasterAgentPanel from "./MasterAgentPanel";

// Docked bottom-right on open (computed from the viewport in `initialRect`).
const MASTER_W = 460;
const MASTER_H = 620;

export default function MasterAgentWindow({
  onClose,
}: {
  onClose: () => void;
}) {
  return (
    <WindowPanel
      id="war-room-master-agent"
      title="Master Agent — all rooms"
      titleNode={
        <span className="flex items-center gap-1.5 min-w-0">
          <Radar className="size-3.5 shrink-0 text-primary" />
          <span className="truncate">Master Agent — all rooms</span>
        </span>
      }
      onClose={onClose}
      width={MASTER_W}
      height={MASTER_H}
      minWidth={360}
      minHeight={420}
      initialRect={{
        x: Math.max(16, window.innerWidth - MASTER_W - 24),
        y: Math.max(16, window.innerHeight - MASTER_H - 24),
      }}
      bodyClassName="p-0"
    >
      <MasterAgentPanel />
    </WindowPanel>
  );
}
