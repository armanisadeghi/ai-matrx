"use client";

import { cn } from "@/lib/utils";

const LEVEL_CONFIG: Record<
  1 | 2 | 3 | 4,
  { label: string; description: string; className: string }
> = {
  1: {
    label: "L1",
    description: "Quick read — outerHTML on tab open",
    className:
      "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/40",
  },
  2: {
    label: "L2",
    description: "Load + scroll — full page including lazy content",
    className:
      "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/40",
  },
  3: {
    label: "L3",
    description: "User-gated — surfaces tab for manual click-through",
    className:
      "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800/40",
  },
  4: {
    label: "L4",
    description: "Manual paste — user copies content directly",
    className:
      "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800/40",
  },
};

interface Props {
  level: 1 | 2 | 3 | 4;
  className?: string;
}

export function CaptureLevelChip({ level, className }: Props) {
  const cfg = LEVEL_CONFIG[level];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1 py-px text-[9px] font-mono font-semibold",
        cfg.className,
        className,
      )}
      title={cfg.description}
    >
      {cfg.label}
    </span>
  );
}
