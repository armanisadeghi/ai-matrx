// components/official/drill-explorer/grain.ts — THE GRAIN A WINDOW READS BEST AT (lane DRILL-EXPLORER).

import type { DrillDefinition } from "@ai-matrx/records";
import { drillWindowRange, type MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";

/** The grain a window reads best at: up to 90 days by day, up to a year by week, longer by month. */
export function drillExplorerAutoGrain(window: string | null | undefined): "day" | "week" | "month" {
  // `drillAutoGrain` ships in @ai-matrx/design-system 0.49.38; the installed release is 0.49.37
  // (PROGRESS-DRILL-EXPLORER "After publish"). Same policy as the package helper.
  const range = drillWindowRange(window);
  if (!range) return "month";
  const days = (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000;
  if (!Number.isFinite(days) || days <= 90) return "day";
  if (days <= 366) return "week";
  return "month";
}

/**
 * A time group asked with no grain (`by=at`) reads at the grain its window reads best at. The hook
 * and the table both use this, so the answers are keyed exactly as the table asks for them.
 */
export function withAutoGrain(def: DrillDefinition | null, q: MatrxDrillQuestion): MatrxDrillQuestion {
  const grain = drillExplorerAutoGrain(q.window ?? null);
  const timeKeys = new Set((def?.dimensions ?? []).filter((d) => d.kind === "time").map((d) => d.key));
  const fix = (ref: string) => (timeKeys.has(ref) ? `${ref}:${grain}` : ref);
  return { ...q, by: q.by.map(fix), across: q.across ? fix(q.across) : q.across };
}

