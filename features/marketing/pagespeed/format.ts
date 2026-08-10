import type {
  PagePerformanceRegression,
  PagePerformanceSample,
} from "@/features/marketing/pagespeed/data";

export type PerformanceTone = "good" | "warning" | "bad" | "default";

export function lighthouseScore(
  score: number | null | undefined,
): number | null {
  return typeof score === "number" ? Math.round(score * 100) : null;
}

export function lighthouseTone(
  score: number | null | undefined,
): PerformanceTone {
  if (typeof score !== "number") return "default";
  if (score >= 0.9) return "good";
  if (score >= 0.5) return "warning";
  return "bad";
}

export function metric(
  sample: PagePerformanceSample,
  key: string,
): number | null {
  const value = sample.lab_metrics?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function milliseconds(value: number | null, digits = 2): string {
  if (value === null) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(digits)}s`;
  return `${Math.round(value)}ms`;
}

export function metricTone(
  value: number | null,
  goodMax: number,
  warningMax: number,
): PerformanceTone {
  if (value === null) return "default";
  if (value <= goodMax) return "good";
  if (value <= warningMax) return "warning";
  return "bad";
}

export function fieldCategoryTone(
  category: string | null | undefined,
): PerformanceTone {
  const normalized = category?.trim().toUpperCase();
  if (!normalized) return "default";
  if (["FAST", "GOOD", "PASS"].includes(normalized)) return "good";
  if (
    ["AVERAGE", "NEEDS_IMPROVEMENT", "NEEDS IMPROVEMENT"].includes(normalized)
  ) {
    return "warning";
  }
  if (["SLOW", "POOR", "FAIL"].includes(normalized)) return "bad";
  return "default";
}

function shortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date);
}

/** The server has already decided this is a regression; the UI states why. */
export function regressionVerdict(
  regression: PagePerformanceRegression,
): string {
  const strategy = regression.strategy
    ? `${regression.strategy[0].toUpperCase()}${regression.strategy.slice(1)} `
    : "";
  const when = shortDate(regression.current_observed_at);
  if (regression.metric === "performance_score") {
    const previous = Math.round(regression.previous_value * 100);
    const current = Math.round(regression.current_value * 100);
    return `${strategy}lab performance dropped ${Math.abs(current - previous)} points on ${when} (${previous} → ${current}).`;
  }
  if (
    regression.metric === "lcp_ms" ||
    regression.metric === "largest_contentful_paint_p75_ms"
  ) {
    const source =
      regression.data_kind === "field" ? "real-user LCP" : "lab LCP";
    return `${strategy}${source} slowed by ${milliseconds(Math.abs(regression.delta))} on ${when} (${milliseconds(regression.previous_value)} → ${milliseconds(regression.current_value)}).`;
  }
  return `${strategy}${regression.metric.replaceAll("_", " ")} got worse by ${regression.delta.toLocaleString()} on ${when} (${regression.previous_value.toLocaleString()} → ${regression.current_value.toLocaleString()}).`;
}
