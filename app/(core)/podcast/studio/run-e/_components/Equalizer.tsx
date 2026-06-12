"use client";

// app/(core)/podcast/studio/run-e/_components/Equalizer.tsx
//
// A small animated equalizer — used while audio is producing and as the
// now-playing motif. Color is inherited (text-current). Pure CSS animation.

import { cn } from "@/lib/utils";

export function Equalizer({
  bars = 5,
  className,
  playing = true,
}: {
  bars?: number;
  className?: string;
  playing?: boolean;
}) {
  return (
    <span
      className={cn("inline-flex items-end gap-0.5", className)}
      aria-hidden
    >
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "w-0.5 rounded-full bg-current",
            playing && "runE-eq-bar",
          )}
          style={{
            height: "100%",
            animationDelay: `${(i % bars) * 0.12}s`,
            ...(playing ? {} : { transform: "scaleY(0.4)" }),
          }}
        />
      ))}
    </span>
  );
}
