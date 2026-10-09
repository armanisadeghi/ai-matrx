"use client";

/**
 * THE outlier badge (UI-SPEC §1.1) — multiplier + tier + no-baseline state.
 * Every surface (post card, tables, drawer, board tiles) renders THIS; the
 * thresholds and text live in `../outlier.ts`. Tier is carried by the fill AND
 * by a leading bar glyph (one/two/three) so it is never color-only. Fixed
 * 18px height and a min width: swapping `—` for `4.2x` never shifts layout.
 */

import { cn } from "@/lib/utils";

import { outlierBadgeModel, type OutlierBadgeModel, type OutlierTier } from "../outlier";
import type { OutlierInput } from "../types";

const TIER_CLASS: Record<OutlierTier, string> = {
  none: "text-muted-foreground",
  plain: "text-muted-foreground",
  neutral: "bg-muted text-foreground",
  accent: "bg-primary/15 text-primary-ink",
  strong: "bg-primary text-primary-foreground font-bold",
};

function Bars({ count }: { count: 0 | 1 | 2 | 3 }) {
  if (count === 0) return null;
  return (
    <span aria-hidden className="mr-1 inline-flex items-end gap-px">
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={cn("w-[2px] rounded-[1px] bg-current", n <= count ? "opacity-100" : "opacity-25")}
          style={{ height: 3 + n * 2 }}
        />
      ))}
    </span>
  );
}

export interface OutlierBadgeProps {
  /** The stat inputs; or pass a precomputed `model`. */
  input?: OutlierInput;
  model?: OutlierBadgeModel;
  className?: string;
}

export function OutlierBadge({ input, model, className }: OutlierBadgeProps) {
  const m = model ?? (input ? outlierBadgeModel(input) : null);
  if (!m) return null;
  return (
    <span
      title={m.tooltip}
      data-outlier-tier={m.tier}
      className={cn(
        "inline-flex h-[18px] min-w-[2.25rem] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] leading-none tabular-nums",
        TIER_CLASS[m.tier],
        className,
      )}
    >
      <Bars count={m.bars} />
      {m.text}
    </span>
  );
}
