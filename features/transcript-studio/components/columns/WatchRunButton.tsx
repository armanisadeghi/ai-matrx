"use client";

/**
 * WatchRunButton — the door onto a column's AI pass.
 *
 * THE FLOATING LAW half that the thunks can't do on their own: a pass the user
 * did NOT start (the 30s interval cleaner, the session-start pass) binds its
 * conversation but deliberately does not steal the screen. This is how the user
 * reaches it anyway — one click floats the same `liveRunWindow` the manual runs
 * open, bound to the same instance, so there is never a second window.
 *
 * It also replaces the old spinning refresh icon. A spinner while AI works is
 * the defect; a live badge that OPENS the output is the fix.
 *
 * 🚨 A FINISHED run does NOT open the live window. Since run rows are loaded
 * from the DB (`fetchAgentRunsThunk`), this door now appears on a cold page —
 * where a finished conversation has no client-side request row, so the live
 * window would open EMPTY: a dead end (THE DOOR LAW,
 * `common-docs/policies/no-dead-ends.md`). A finished run's canonical home is
 * its conversation, so the door opens that instead, in a new tab so the
 * session the user is working in is never lost.
 */

import { Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { useOpenLiveRunWindow } from "@/features/overlays/openers/liveRunWindow";
import { conversationHref } from "@/features/hindsight/subject-doors";
import { selectLatestRunForColumn } from "../../redux/selectors";
import { studioLiveRunInstanceId } from "../../redux/liveRunWatch";

interface WatchRunButtonProps {
  sessionId: string;
  /** 2 = cleanup, 3 = concepts, 4 = module. */
  columnIdx: number;
  /** What the window calls this run, e.g. "Cleaning transcript". */
  label: string;
  className?: string;
}

export function WatchRunButton({
  sessionId,
  columnIdx,
  label,
  className,
}: WatchRunButtonProps) {
  const run = useAppSelector(selectLatestRunForColumn(sessionId, columnIdx));
  const openLiveRun = useOpenLiveRunWindow();

  // Nothing to open until the run's conversation exists. Once it does, the
  // door stays available after the run completes — the finished output is
  // exactly what a user who missed the stream wants to read.
  if (!run?.conversationId) return null;

  const isRunning = run.status === "running" || run.status === "queued";

  return (
    <button
      type="button"
      onClick={() => {
        if (!run.conversationId) return;
        if (isRunning) {
          openLiveRun({
            instanceId: studioLiveRunInstanceId(sessionId, columnIdx),
            conversationId: run.conversationId,
            label,
          });
          return;
        }
        window.open(
          conversationHref(run.conversationId, "product"),
          "_blank",
          "noopener,noreferrer",
        );
      }}
      title={
        isRunning
          ? `Watch: ${label}`
          : `Open the last run in a new tab — ${label}`
      }
      aria-label={
        isRunning
          ? `Watch ${label}`
          : `Open the last ${label} run in a new tab`
      }
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded transition-colors",
        isRunning
          ? "text-primary hover:bg-accent/40"
          : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
        className,
      )}
    >
      <Radio className={cn("h-3 w-3", isRunning && "animate-pulse")} />
    </button>
  );
}
