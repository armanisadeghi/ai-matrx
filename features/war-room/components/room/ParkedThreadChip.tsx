"use client";

// features/war-room/components/room/ParkedThreadChip.tsx
//
// One chip in the parked (hidden) section. Grafted from the ui-sharp variant:
// reference macOS Stage Manager's off-stage strip. A hidden thread is never
// "gone" — the chip shows its title + a tiny LIVE status trio (task / notes /
// audio) so it stays readable while parked, and clicking it restores AND stages
// it in one move (you land straight back where you left off). Uses the real
// toggleTileHide thunk.

import { ListChecks, NotebookPen, Mic, Eye } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toggleTileHide } from "@/features/war-room/redux/thunks";
import { cn } from "@/lib/utils";
import { useTilePulse } from "@/features/war-room/hooks/useTilePulse";

export function ParkedThreadChip({
  tileId,
  title,
  onRestore,
}: {
  tileId: string;
  title: string;
  /** Called after the tile is un-hidden — e.g. to stage it. */
  onRestore?: (tileId: string) => void;
}) {
  const dispatch = useAppDispatch();
  const pulse = useTilePulse(tileId);

  return (
    <button
      type="button"
      onClick={() => {
        dispatch(toggleTileHide(tileId, false));
        onRestore?.(tileId);
      }}
      title={`Bring "${title}" back to the stage`}
      className={cn(
        "group/chip flex w-full items-center gap-2 rounded-lg border border-border/70 bg-card px-2 py-1.5 text-left transition-all",
        "hover:border-primary/40 hover:bg-accent/40 hover:shadow-[var(--elevation-1)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="truncate text-[12px] font-medium text-foreground">
          {title}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <ChipDot
            Icon={ListChecks}
            active={pulse.hasTask}
            accent={pulse.hasTask && !pulse.taskDone}
          />
          <ChipDot Icon={NotebookPen} active={pulse.noteChars > 0} />
          <ChipDot
            Icon={Mic}
            active={pulse.transcriptChars > 0 || pulse.audioSessionCount > 0}
            accent={pulse.transcriptChars > 0}
          />
        </div>
      </div>
      <Eye className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover/chip:opacity-100 group-hover/chip:text-primary transition-all" />
    </button>
  );
}

function ChipDot({
  Icon,
  active,
  accent,
}: {
  Icon: typeof ListChecks;
  active: boolean;
  accent?: boolean;
}) {
  return (
    <Icon
      className={cn(
        "size-3 transition-colors",
        active
          ? accent
            ? "text-primary"
            : "text-foreground/55"
          : "text-muted-foreground/35",
      )}
    />
  );
}
