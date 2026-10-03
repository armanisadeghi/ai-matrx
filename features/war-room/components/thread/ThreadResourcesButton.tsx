"use client";

// features/war-room/components/thread/ThreadResourcesButton.tsx
//
// The 1-click resources surface for a thread: a paperclip+count button (lives
// in every thread header — grid tile and stage) toggling the thread's
// `war-room-resources` canvas tab (the full ThreadResourcesTab, beside the
// room), pressed while that tab is in front.

import { Paperclip } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectContentAssignmentsForThread } from "@/features/war-room/redux/selectors";
import { useToolToggle } from "@/features/canvas/host/toolCanvas";
import { threadResourcesToggleInput } from "@/features/war-room/canvas/warRoomResourcesKind";
import { cn } from "@/lib/utils";

export function ThreadResourcesButton({
  threadId,
  threadTitle,
  className,
}: {
  threadId: string;
  threadTitle?: string | null;
  className?: string;
}) {
  const tab = useToolToggle(threadResourcesToggleInput(threadId, threadTitle));
  const count = useAppSelector(
    selectContentAssignmentsForThread(threadId),
  ).length;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        tab.toggle();
      }}
      aria-pressed={tab.isVisible}
      title="Resources — everything attached to this thread"
      aria-label="Thread resources"
      className={cn(
        "grid size-6 shrink-0 grid-flow-col place-items-center gap-0.5 rounded-md px-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        count > 0 && "w-auto",
        tab.isVisible && "bg-accent text-foreground",
        className,
      )}
    >
      <Paperclip className="size-3.5" />
      {count > 0 && (
        <span className="text-[10px] font-medium tabular-nums">{count}</span>
      )}
    </button>
  );
}
