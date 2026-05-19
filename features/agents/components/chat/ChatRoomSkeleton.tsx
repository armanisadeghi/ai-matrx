"use client";

import { cn } from "@/lib/utils";

/**
 * Skeleton that matches the eventual conversation column layout — message
 * bubbles + input bar — so the chat surface doesn't flash a spinner-then-shift
 * on cold load. Mounted by `ChatRoomClient` while the agent execution payload
 * fetches and the launcher seeds the first instance.
 */
export function ChatRoomSkeleton() {
  return (
    <div className="flex-1 min-h-0 overflow-hidden flex justify-center">
      <div className="w-full max-w-3xl flex flex-col h-full px-4 py-3">
        <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
          <SkeletonMessage align="left" widths={[60, 80, 45]} />
          <SkeletonMessage align="right" widths={[70, 55]} />
          <SkeletonMessage align="left" widths={[85, 90, 60, 70]} />
        </div>
        <div className="shrink-0 mt-3">
          <div className="rounded-lg border border-border bg-card/60 h-24 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

function SkeletonMessage({
  align,
  widths,
}: {
  align: "left" | "right";
  widths: number[];
}) {
  return (
    <div
      className={cn("flex flex-col gap-1.5", align === "right" && "items-end")}
    >
      {widths.map((w, i) => (
        <div
          key={i}
          className="h-3.5 rounded bg-muted/60 animate-pulse"
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  );
}
