// features/employee-performance-reviews/standard/deltas.ts
//
// THE DIFFERENCES-FIRST COMPARISON. Once both halves are in, the useful question is "where do
// they disagree", so the rows are ranked by the size of the gap, largest first, computed here in
// code (never by a model, never by eye). Ties keep template order, so the list is stable.

import type { ReviewAnswers, TemplateSnapshot } from "./types";

export interface RatingDelta {
  /** `category.item`, the key the answers use. */
  key: string;
  category: string;
  item: string;
  self: number;
  manager: number;
  /** manager minus self: positive means the manager rated higher. */
  gap: number;
  size: number;
}

export function rankRatingDeltas(template: TemplateSnapshot, self: ReviewAnswers, manager: ReviewAnswers): RatingDelta[] {
  const rows: RatingDelta[] = [];
  for (const section of template.sections) {
    for (const q of section.questions) {
      if (q.type !== "rating") continue;
      for (const item of q.items) {
        const key = `${q.key}.${item.key}`;
        const s = self.ratings[key];
        const m = manager.ratings[key];
        if (typeof s !== "number" || typeof m !== "number") continue;
        rows.push({ key, category: q.label, item: item.label, self: s, manager: m, gap: m - s, size: Math.abs(m - s) });
      }
    }
  }
  // Array.prototype.sort is stable: equal gaps stay in template order.
  return rows.sort((a, b) => b.size - a.size);
}

export interface RatingAverages {
  self: number | null;
  manager: number | null;
}

export function averageRatings(deltas: RatingDelta[]): RatingAverages {
  if (deltas.length === 0) return { self: null, manager: null };
  const sum = (f: (d: RatingDelta) => number) => deltas.reduce((n, d) => n + f(d), 0) / deltas.length;
  return { self: sum((d) => d.self), manager: sum((d) => d.manager) };
}
