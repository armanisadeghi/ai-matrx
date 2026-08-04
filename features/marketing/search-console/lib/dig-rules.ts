/**
 * Dig Here rule vocabulary — pure helpers (Jest-tested, no IO). Client-side
 * validation MIRRORS the server whitelist in `seo.gsc_perf_dig`
 * (migrations/seo_gsc_dig_watch_launch.sql): whitelisted metric + op, finite
 * numeric value, ≤ 20 conditions, compare-requiring metrics need a compare
 * period. The server RAISE is the backstop; this layer exists so the editor
 * can explain problems before a round-trip.
 */

import type { Json } from "@/types/database.types";
import type {
  GscDigCondition,
  GscDigMetric,
  GscDigOp,
  GscFilters,
} from "@/features/marketing/search-console/types";
import {
  GSC_DIG_METRICS,
  GSC_DIG_OPS,
  formatCount,
  formatCtr,
  formatPosition,
} from "@/features/marketing/search-console/types";

export const MAX_DIG_CONDITIONS = 20;

const METRIC_KEYS = new Set<string>(GSC_DIG_METRICS.map((m) => m.key));
const OP_KEYS = new Set<string>(GSC_DIG_OPS.map((o) => o.key));

/** The rule fields `gsc_perf_dig` consumes — what an editor draft holds. */
export interface GscDigRuleContent {
  dimension: "query" | "page";
  conditions: GscDigCondition[];
  sortMetric: GscDigMetric | "key";
  sortDir: "asc" | "desc";
  rowLimit: number;
  baseFilters: GscFilters;
}

export function isDigMetric(value: unknown): value is GscDigMetric {
  return typeof value === "string" && METRIC_KEYS.has(value);
}

export function isDigOp(value: unknown): value is GscDigOp {
  return typeof value === "string" && OP_KEYS.has(value);
}

export function metricRequiresCompare(metric: GscDigMetric | "key"): boolean {
  return metric.startsWith("cmp_") || metric.startsWith("delta_");
}

/** True when running this rule needs a compare period (conditions OR sort). */
export function ruleRequiresCompare(rule: GscDigRuleContent): boolean {
  return (
    metricRequiresCompare(rule.sortMetric) ||
    rule.conditions.some((c) => metricRequiresCompare(c.metric))
  );
}

/**
 * Parse a stored `conditions` jsonb into the typed shape, dropping nothing
 * silently: an unrecognizable entry makes the whole parse fail (a rule that
 * would run differently than displayed is worse than an error).
 */
export function parseDigConditions(
  raw: Json,
): { ok: true; conditions: GscDigCondition[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "Conditions are not a list" };
  }
  const out: GscDigCondition[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return { ok: false, error: "A condition is not an object" };
    }
    const metric = (entry as Record<string, Json | undefined>).metric;
    const op = (entry as Record<string, Json | undefined>).op;
    const value = (entry as Record<string, Json | undefined>).value;
    if (!isDigMetric(metric)) {
      return { ok: false, error: `Unknown metric: ${String(metric)}` };
    }
    if (!isDigOp(op)) {
      return { ok: false, error: `Unknown operator: ${String(op)}` };
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { ok: false, error: `Non-numeric value for ${metric}` };
    }
    out.push({ metric, op, value });
  }
  return { ok: true, conditions: out };
}

/** Editor-side validation, mirroring the server RAISEs. Empty = valid. */
export function validateDigRule(
  rule: GscDigRuleContent,
  hasCompare: boolean,
): string[] {
  const errors: string[] = [];
  if (rule.conditions.length > MAX_DIG_CONDITIONS) {
    errors.push(`At most ${MAX_DIG_CONDITIONS} conditions.`);
  }
  rule.conditions.forEach((c, i) => {
    if (!isDigMetric(c.metric)) errors.push(`Condition ${i + 1}: unknown metric.`);
    if (!isDigOp(c.op)) errors.push(`Condition ${i + 1}: unknown operator.`);
    if (typeof c.value !== "number" || !Number.isFinite(c.value)) {
      errors.push(`Condition ${i + 1}: value must be a number.`);
    }
  });
  if (rule.rowLimit < 1 || rule.rowLimit > 1000) {
    errors.push("Row limit must be between 1 and 1000.");
  }
  if (!hasCompare && ruleRequiresCompare(rule)) {
    errors.push(
      "This rule uses compare metrics (Δ / prev) — a compare period is required.",
    );
  }
  return errors;
}

const METRIC_LABEL: Record<GscDigMetric, string> = Object.fromEntries(
  GSC_DIG_METRICS.map((m) => [m.key, m.label]),
) as Record<GscDigMetric, string>;

const OP_LABEL: Record<GscDigOp, string> = Object.fromEntries(
  GSC_DIG_OPS.map((o) => [o.key, o.label]),
) as Record<GscDigOp, string>;

function formatConditionValue(metric: GscDigMetric, value: number): string {
  if (metric === "ctr" || metric === "cmp_ctr" || metric === "delta_ctr") {
    return formatCtr(value);
  }
  if (metric.endsWith("_pct")) return `${value}%`;
  if (metric === "position" || metric === "cmp_position" || metric === "delta_position") {
    return formatPosition(value);
  }
  return formatCount(value);
}

/** "Position ≥ 8 · Position ≤ 20 · Impressions > 500" */
export function digRuleSummary(conditions: GscDigCondition[]): string {
  if (conditions.length === 0) return "No conditions — everything matches";
  return conditions
    .map(
      (c) =>
        `${METRIC_LABEL[c.metric]} ${OP_LABEL[c.op]} ${formatConditionValue(c.metric, c.value)}`,
    )
    .join(" · ");
}

/** Stable content hash for react-query keys — runs re-key when the draft changes. */
export function digRuleContentKey(rule: GscDigRuleContent): string {
  return JSON.stringify([
    rule.dimension,
    rule.conditions.map((c) => [c.metric, c.op, c.value]),
    rule.sortMetric,
    rule.sortDir,
    rule.rowLimit,
    Object.entries(rule.baseFilters)
      .filter(([, v]) => typeof v === "string" && v.trim() !== "")
      .sort(([a], [b]) => a.localeCompare(b)),
  ]);
}

/** Conditions → the jsonb wire/storage shape (what gsc_perf_dig validates). */
export function serializeDigConditions(conditions: GscDigCondition[]): Json {
  return conditions.map((c) => ({
    metric: c.metric,
    op: c.op,
    value: c.value,
  }));
}
