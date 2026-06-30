"use client";

/**
 * TrayStatusChip — the canonical "minimized-window status indicator".
 *
 * A small, presentational mini-view for the body of a minimized window (or a
 * tray chip): a tinted icon that conveys severity at a glance, a primary count,
 * an optional caption, and an optional per-tone breakdown. It is the reusable
 * primitive behind window-specific previews like the Error Inspector's bug
 * indicator — any window whose minimized value is "a status + a few numbers"
 * (errors, active recordings, running jobs, unread items…) maps onto this
 * instead of hand-rolling a one-off chip.
 *
 * Design contract:
 *  - **Presentational only.** No store reads, no effects, no Redux. The consumer
 *    subscribes to its own live source and passes plain props down. This keeps
 *    the chip render-cheap and lets the consumer own the (isolated) subscription.
 *  - **Tone is the signal.** `tone` tints the icon using the same colour
 *    language as `lib/diagnostics/errorTiers.ts` so severity reads identically
 *    everywhere (blue → yellow → amber → red).
 *  - **Limit what's shown.** A minimized chip is ~270×100; it must stay
 *    glanceable. One icon, one number, an optional caption, and a tiny
 *    breakdown — no more. Breakdown segments render only when more than one is
 *    non-zero (a single tone is already carried by the icon colour + count).
 *
 * Rendered INSIDE `TrayChipPreview`'s custom-mode wrapper, which already
 * supplies `flex-1`, padding, and overflow clipping — so this root only needs
 * to lay out its own row.
 */

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Severity scale, loudest-last. Maps onto the captured-error tiers but is
 * intentionally generic so non-error windows can reuse it:
 *   neutral  — inert / nothing notable (muted)
 *   info     — active & healthy, "monitoring" (blue)
 *   warning  — low / silent (yellow)
 *   elevated — minor / worth a glance (amber)
 *   critical — loud / needs attention (destructive red)
 */
export type TrayStatusTone =
  | "neutral"
  | "info"
  | "warning"
  | "elevated"
  | "critical";

interface ToneClasses {
  /** Icon + primary-count text colour. */
  fg: string;
  /** Breakdown dot fill. */
  dot: string;
}

const TONE_CLASSES: Record<TrayStatusTone, ToneClasses> = {
  neutral: {
    fg: "text-muted-foreground",
    dot: "bg-muted-foreground/50",
  },
  info: {
    fg: "text-sky-500 dark:text-sky-400",
    dot: "bg-sky-500",
  },
  warning: {
    fg: "text-yellow-600 dark:text-yellow-500",
    dot: "bg-yellow-400",
  },
  elevated: {
    fg: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  critical: {
    fg: "text-destructive",
    dot: "bg-destructive",
  },
};

export interface TrayStatusSegment {
  count: number;
  tone: TrayStatusTone;
  /** Accessible/tooltip label, e.g. "clear errors". */
  label?: string;
}

export interface TrayStatusChipProps {
  /** Lucide icon component — the glanceable identity/severity mark. */
  icon: LucideIcon;
  /** Overall severity — tints the icon (and the primary count). */
  tone: TrayStatusTone;
  /** Primary number. Omit (or pass undefined) to show only the caption. */
  count?: number;
  /** Shown when there's no count (e.g. the all-clear / idle state). */
  caption?: string;
  /** Per-tone breakdown. Only renders when 2+ entries are non-zero. */
  segments?: TrayStatusSegment[];
  /** Pulse the icon (e.g. unseen activity since minimize). */
  pulse?: boolean;
}

export function TrayStatusChip({
  icon: Icon,
  tone,
  count,
  caption,
  segments,
  pulse,
}: TrayStatusChipProps) {
  const t = TONE_CLASSES[tone];
  const visibleSegments = (segments ?? []).filter((s) => s.count > 0);
  const showBreakdown = visibleSegments.length > 1;
  const hasCount = typeof count === "number";

  // Scale matches the sibling `ErrorInspectorBadge` (h-3.5 icon / text-xs count
  // / text-[10px] detail) — the same tray text scale as every other preview.
  // Never bump these: a minimized chip is ~270px wide and must stay glanceable.
  return (
    <div className="flex h-full items-center gap-1.5 overflow-hidden">
      <Icon
        className={cn("h-3.5 w-3.5 shrink-0", t.fg, pulse && "animate-pulse")}
        aria-hidden
      />

      <div className="flex min-w-0 items-baseline gap-1">
        {hasCount ? (
          <span className={cn("text-xs font-semibold tabular-nums", t.fg)}>
            {count}
          </span>
        ) : null}
        {caption ? (
          <span className="truncate text-[11px] text-muted-foreground">
            {caption}
          </span>
        ) : null}
      </div>

      {showBreakdown ? (
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {visibleSegments.map((s, i) => (
            <span
              key={i}
              className="flex items-center gap-0.5"
              title={s.label ? `${s.count} ${s.label}` : undefined}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  TONE_CLASSES[s.tone].dot,
                )}
              />
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {s.count}
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default TrayStatusChip;
