"use client";

/**
 * ShimmerText
 *
 * A subtle left-to-right gradient sweep across a line of text — the standard
 * "the server is working on it" status look (e.g. "Processing…", "Planning…",
 * or a server status / interstitial message). Deliberately quiet: no spinner,
 * no progress bar, no layout drama — just the text shimmering in place.
 *
 * Single source of truth. The streaming markdown engine's pre-token state,
 * `AgentStatusIndicator`, and `AgentPlanningIndicator` all render through this
 * so the "waiting for the server" treatment is identical everywhere.
 *
 * Font size comes from `className` (callers pass e.g. `text-sm` / `text-[11px]`).
 * The shimmer keyframe is `--animate-shimmer` in `app/globals.css`.
 */

import { cn } from "@/lib/utils";

export interface ShimmerTextProps {
  text: string;
  className?: string;
}

export function ShimmerText({ text, className }: ShimmerTextProps) {
  return (
    <span
      className={cn(
        "inline-block bg-clip-text text-transparent bg-[length:200%_100%] animate-shimmer",
        className,
      )}
      style={{
        backgroundImage:
          "linear-gradient(90deg, hsl(var(--muted-foreground) / 0.3) 0%, hsl(var(--foreground)) 50%, hsl(var(--muted-foreground) / 0.3) 100%)",
      }}
    >
      {text}
    </span>
  );
}
