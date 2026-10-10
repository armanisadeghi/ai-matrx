// features/employee-performance-reviews/standard/calibration.ts
//
// The calibration distribution, computed in code from the door's counts: one bar per point on the
// cycle's rating scale (scale order), then "Not rated yet", then any key the scale does not know
// (named, never dropped). Shares are of the total, so a bar's width is honest.

import type { ManagerDistribution, RatingPoint } from "./types";

export interface DistributionBar {
  key: string;
  label: string;
  count: number;
  /** 0 to 1 of the total; 0 when the total is 0. */
  share: number;
}

export function distributionBars(byRating: Record<string, number>, scale: RatingPoint[]): DistributionBar[] {
  const total = Object.values(byRating).reduce((n, c) => n + c, 0);
  const known = new Set(scale.map((p) => p.key));
  const ordered = [...scale].sort((a, b) => a.value - b.value);
  const keys: Array<{ key: string; label: string }> = [
    ...ordered.map((p) => ({ key: p.key, label: p.label })),
    { key: "unrated", label: "Not rated yet" },
    ...Object.keys(byRating)
      .filter((k) => k !== "unrated" && !known.has(k))
      .sort()
      .map((k) => ({ key: k, label: k })),
  ];
  return keys.map(({ key, label }) => {
    const count = byRating[key] ?? 0;
    return { key, label, count, share: total === 0 ? 0 : count / total };
  });
}

export interface ManagerBars {
  managerName: string;
  count: number;
  bars: DistributionBar[];
}

/** One row of bars per manager, the busiest team first. Each manager's shares are of their own team. */
export function managerBars(byManager: ManagerDistribution[], scale: RatingPoint[]): ManagerBars[] {
  return [...byManager]
    .sort((a, b) => b.count - a.count || a.managerName.localeCompare(b.managerName))
    .map((m) => ({ managerName: m.managerName, count: m.count, bars: distributionBars(m.byRating, scale) }));
}
