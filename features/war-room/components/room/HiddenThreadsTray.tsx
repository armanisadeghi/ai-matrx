"use client";

// features/war-room/components/room/HiddenThreadsTray.tsx
//
// Grid-mode parked-threads dock: a slim bottom strip of chips for hidden tiles.
// Each chip wears the ui-sharp parked-thread treatment — a live status trio
// (task / notes / audio) so a parked thread still reads as alive — and clicking
// it restores AND stages the thread (lands you straight back in it). Hidden ≠
// gone.

import { EyeOff } from "lucide-react";
import type { WarRoomThread } from "@/features/war-room/types";
import { ParkedThreadChip } from "./ParkedThreadChip";
import { useRoomView } from "./roomViewContext";

export function HiddenThreadsTray({
  threads,
}: {
  sessionId: string;
  threads: WarRoomThread[];
}) {
  const { stageThread } = useRoomView();
  if (threads.length === 0) return null;

  return (
    <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-t border-border bg-muted/25 overflow-x-auto scrollbar-hide">
      <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground shrink-0">
        <EyeOff className="size-3.5" />
        Parked ({threads.length})
      </span>
      <div className="flex items-center gap-1.5">
        {threads.map((t) => (
          <div key={t.id} className="w-44 shrink-0">
            <ParkedThreadChip
              threadId={t.id}
              title={t.title?.trim() || "Untitled thread"}
              onRestore={(id) => stageThread(id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
