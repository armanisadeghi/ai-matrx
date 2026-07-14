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
        <div className="flex-1 min-h-0 overflow-hidden pt-12">
          <div className="space-y-7 pb-[35dvh]">
            <SkeletonMessage
              align="right"
              widths={[42, 30]}
              className="max-w-[78%] ml-auto"
            />
            <SkeletonMessage
              align="left"
              widths={[96, 88, 92, 74, 90, 66, 84, 38]}
            />
          </div>
        </div>
        <div className="shrink-0 mt-3">
          <div className="rounded-lg border border-border bg-card/60 p-3">
            <div className="h-3.5 w-1/2 rounded bg-muted/50 animate-pulse" />
            <div className="mt-8 flex items-center justify-between">
              <div className="flex gap-2">
                <div className="h-7 w-7 rounded-md bg-muted/45 animate-pulse" />
                <div className="h-7 w-7 rounded-md bg-muted/40 animate-pulse" />
              </div>
              <div className="h-8 w-8 rounded-full bg-primary/25 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SkeletonMessage({
  align,
  widths,
  className,
}: {
  align: "left" | "right";
  widths: number[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        align === "right" && "items-end",
        className,
      )}
    >
      {widths.map((w, i) => (
        <div
          key={i}
          className="h-3.5 rounded bg-muted/55 animate-pulse"
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  );
}
