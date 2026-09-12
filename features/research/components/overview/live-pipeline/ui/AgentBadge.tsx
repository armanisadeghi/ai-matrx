"use client";

import { cn } from "@/lib/utils";
// THE package avatar-color hash (`@ai-matrx/kit/format`, census H1
// 2026-09-07). `(h<<5)-h` is `h*31`, so this file's hash was already
// mathematically identical to `avatarPaletteIndex`'s; the 8-color PALETTE
// below still assigns identical colors to identical agent types.
import { avatarPaletteIndex } from "@ai-matrx/kit/format";

interface Props {
  agentType: string;
  className?: string;
}

/**
 * Hash a string into a deterministic color from a fixed palette.
 * Same agent_type → same color across renders.
 */
const PALETTE = [
  "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800/40",
  "bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-800/40",
  "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800/40",
  "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800/40",
  "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800/40",
  "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800/40",
  "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800/40",
  "bg-lime-100 text-lime-800 border-lime-200 dark:bg-lime-900/30 dark:text-lime-300 dark:border-lime-800/40",
];

export function AgentBadge({ agentType, className }: Props) {
  const color = PALETTE[avatarPaletteIndex(agentType, PALETTE.length)];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium",
        color,
        className,
      )}
      title={agentType}
    >
      {agentType}
    </span>
  );
}
