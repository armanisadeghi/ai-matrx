// features/education/study/components/MasteryDisplay.tsx
//
// The SHARED mastery visualization: a per-item tier pill and a per-deck
// distribution bar, both driven by the canonical `masteryTier` vocabulary
// (utils/masteryFsrs). Any surface — the flashcards editor + set detail, a P5
// dashboard, the game recap — renders mastery the SAME way through these, so the
// display language never forks. Reads `item_mastery` rows the caller already has.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import type { ItemMasteryRow } from "../types";
import {
  masteryTier,
  MASTERY_TIER_LABEL,
  MASTERY_TIER_ORDER,
  type MasteryTier,
} from "../utils/masteryFsrs";
import { cn } from "@/lib/utils";

/** Per-tier color treatment (low → high: red → amber → yellow → blue → green). */
const TIER_PILL: Record<MasteryTier, string> = {
  new: "border-border bg-muted/60 text-muted-foreground",
  struggling:
    "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
  learning:
    "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  familiar:
    "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  mastered:
    "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300",
};

const TIER_BAR: Record<MasteryTier, string> = {
  new: "bg-muted-foreground/25",
  struggling: "bg-red-500",
  learning: "bg-amber-500",
  familiar: "bg-blue-500",
  mastered: "bg-green-500",
};

/** A compact per-item mastery pill: the tier name + (when studied) the %. */
export function MasteryTierPill({
  mastery,
  showPct = true,
  className,
}: {
  mastery: ItemMasteryRow | null | undefined;
  showPct?: boolean;
  className?: string;
}) {
  const { tier, label, pct } = masteryTier(mastery);
  return (
    <span
      title={
        pct != null ? `${label} · ${Math.round(pct * 100)}% recall` : label
      }
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0 text-[10px] font-medium",
        TIER_PILL[tier],
        className,
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TIER_BAR[tier])}
      />
      {label}
      {showPct && pct != null ? ` ${Math.round(pct * 100)}%` : ""}
    </span>
  );
}

export interface MasteryDistribution {
  counts: Record<MasteryTier, number>;
  total: number;
  /** Cards with any study history (total − new). */
  studied: number;
  /** Share mastered of the WHOLE deck (0–1). */
  masteredPct: number;
}

/** Bucket a set of mastery rows (one per card; absent = never studied) into tiers. */
export function computeMasteryDistribution(
  masteries: (ItemMasteryRow | null | undefined)[],
): MasteryDistribution {
  const counts: Record<MasteryTier, number> = {
    new: 0,
    struggling: 0,
    learning: 0,
    familiar: 0,
    mastered: 0,
  };
  for (const m of masteries) counts[masteryTier(m).tier] += 1;
  const total = masteries.length;
  const studied = total - counts.new;
  const masteredPct = total > 0 ? counts.mastered / total : 0;
  return { counts, total, studied, masteredPct };
}

/**
 * A per-deck mastery distribution bar: a single segmented bar (tier colors) +
 * a "X% mastered" headline and a compact per-tier legend. Renders nothing when
 * there are no cards.
 */
export function DeckMasteryBar({
  masteries,
  className,
}: {
  masteries: (ItemMasteryRow | null | undefined)[];
  className?: string;
}) {
  const dist = computeMasteryDistribution(masteries);
  if (dist.total === 0) return null;

  const segments = MASTERY_TIER_ORDER.filter((t) => dist.counts[t] > 0);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-foreground">
          {Math.round(dist.masteredPct * 100)}% mastered
        </span>
        <span className="text-muted-foreground">
          {dist.studied}/{dist.total} studied
        </span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((t) => (
          <div
            key={t}
            className={cn("h-full", TIER_BAR[t])}
            style={{ width: `${(dist.counts[t] / dist.total) * 100}%` }}
            title={`${MASTERY_TIER_LABEL[t]}: ${dist.counts[t]}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
        {MASTERY_TIER_ORDER.filter((t) => dist.counts[t] > 0).map((t) => (
          <span key={t} className="inline-flex items-center gap-1">
            <span
              className={cn("h-1.5 w-1.5 rounded-full", TIER_BAR[t])}
            />
            {MASTERY_TIER_LABEL[t]} {dist.counts[t]}
          </span>
        ))}
      </div>
    </div>
  );
}
