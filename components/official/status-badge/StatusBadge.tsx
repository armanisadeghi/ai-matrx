// components/official/status-badge/StatusBadge.tsx
//
// THE canonical lifecycle-status badge: one colour-coded, icon-led pill for
// "what state is this record in" (draft / active / disabled / archived and
// their cousins on other entities). A status nobody can miss is the point —
// so the colour is solid enough to read at a glance, the icon carries the
// meaning for colour-blind readers, and the label is always a word, never a
// dot alone.
//
// Entity modules own their status VOCABULARY (which statuses exist, what
// each means, which tone it wears); this primitive owns only the LOOK, so
// every entity's status reads the same way everywhere it appears. Example:
// features/mandates/status/MandateStatusBadge.tsx.

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";
export type StatusBadgeSize = "sm" | "md" | "lg";

const TONE_CLASS: Record<StatusTone, string> = {
  success:
    "border-emerald-600/40 bg-emerald-500/15 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-400/15 dark:text-emerald-200",
  warning:
    "border-amber-600/50 bg-amber-400/20 text-amber-900 dark:border-amber-300/40 dark:bg-amber-300/15 dark:text-amber-100",
  danger:
    "border-rose-600/50 bg-rose-500/15 text-rose-800 dark:border-rose-400/40 dark:bg-rose-400/15 dark:text-rose-200",
  neutral:
    "border-zinc-500/40 bg-zinc-500/15 text-zinc-700 dark:border-zinc-400/40 dark:bg-zinc-400/15 dark:text-zinc-200",
  info: "border-sky-600/40 bg-sky-500/15 text-sky-800 dark:border-sky-400/40 dark:bg-sky-400/15 dark:text-sky-200",
};

const SIZE_CLASS: Record<StatusBadgeSize, { root: string; icon: string }> = {
  sm: { root: "gap-1 px-1.5 py-0.5 text-[11px]", icon: "h-3 w-3" },
  md: { root: "gap-1.5 px-2 py-0.5 text-xs", icon: "h-3.5 w-3.5" },
  lg: { root: "gap-1.5 px-2.5 py-1 text-sm", icon: "h-4 w-4" },
};

export interface StatusBadgeProps {
  label: string;
  tone: StatusTone;
  icon?: LucideIcon;
  size?: StatusBadgeSize;
  /** One sentence saying what the status means — the hover text. */
  title?: string;
  className?: string;
}

export function StatusBadge({
  label,
  tone,
  icon: Icon,
  size = "md",
  title,
  className,
}: StatusBadgeProps) {
  const s = SIZE_CLASS[size];
  return (
    <span
      role="status"
      aria-label={title ? `${label}: ${title}` : label}
      title={title}
      data-status-tone={tone}
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border font-semibold leading-none",
        TONE_CLASS[tone],
        s.root,
        className,
      )}
    >
      {Icon ? <Icon className={cn("shrink-0", s.icon)} aria-hidden /> : null}
      {label}
    </span>
  );
}
