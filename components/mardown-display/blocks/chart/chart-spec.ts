/**
 * Chart spec — the forgiving normalizer between an agent's ```chart JSON and
 * the recharts renderer. PURE (no recharts import) so it stays out of any heavy
 * bundle and is unit-testable. The renderer (ChartCanvas) is loaded separately
 * via next/dynamic ssr:false.
 *
 * Agent-facing shape (all keys tolerant):
 *   { "type": "bar", "title": "...", "x": "month", "y": ["revenue","profit"],
 *     "data": [ { "month": "Jan", "revenue": 100, "profit": 20 }, ... ] }
 *   { "type": "pie", "data": [ { "label": "A", "value": 45 }, ... ] }
 */

export type ChartType = "bar" | "line" | "area" | "pie" | "scatter";

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

export interface ChartSpec {
  type: ChartType;
  title?: string;
  /** Category field name (cartesian charts). */
  xKey: string;
  /** Numeric series (cartesian charts). */
  series: ChartSeries[];
  /** Normalized rows. */
  data: Record<string, unknown>[];
  /** Pie field mapping. */
  pie?: { labelKey: string; valueKey: string };
  stacked: boolean;
}

export interface ChartParseError {
  error: string;
}

/** Readable categorical palette (hex; good light/dark contrast). */
export const CHART_PALETTE = [
  "#6366F1", // indigo
  "#059669", // emerald
  "#D97706", // amber
  "#E11D48", // rose
  "#0EA5E9", // sky
  "#7C3AED", // violet
  "#0D9488", // teal
  "#DB2777", // pink
  "#65A30D", // lime
  "#F59E0B", // amber-light
];

const TYPE_SYNONYMS: Record<string, ChartType> = {
  bar: "bar",
  column: "bar",
  bars: "bar",
  histogram: "bar",
  line: "line",
  lines: "line",
  spline: "line",
  area: "area",
  areas: "area",
  pie: "pie",
  donut: "pie",
  doughnut: "pie",
  scatter: "scatter",
  point: "scatter",
  bubble: "scatter",
};

const X_KEYS = ["x", "xkey", "xKey", "category", "name", "label", "axis"];
const Y_KEYS = ["y", "ykeys", "yKeys", "series", "values", "value"];
const PIE_LABEL_KEYS = ["label", "name", "category", "key", "x"];
const PIE_VALUE_KEYS = ["value", "y", "count", "amount", "total"];

/** Strip trailing commas + a stray ```json wrapper so brittle JSON still parses. */
function tolerantParse(raw: string): unknown {
  let s = raw.trim();
  const fenced = /^```(?:json|chart)?\s*\n([\s\S]*?)\n?```$/.exec(s);
  if (fenced) s = fenced[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    // remove trailing commas before } or ]
    try {
      return JSON.parse(s.replace(/,(\s*[}\]])/g, "$1"));
    } catch {
      return undefined;
    }
  }
}

function firstKey(obj: Record<string, unknown>, candidates: string[]): string | undefined {
  const keys = Object.keys(obj);
  for (const c of candidates) {
    const hit = keys.find((k) => k.toLowerCase() === c.toLowerCase());
    if (hit) return hit;
  }
  return undefined;
}

function isNumericLike(v: unknown): boolean {
  return typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)));
}

export function parseChartSpec(raw: string): ChartSpec | ChartParseError {
  const obj = tolerantParse(raw);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return { error: "Chart needs a JSON object with a `type` and `data`." };
  }
  const o = obj as Record<string, unknown>;

  const rawType = String(o.type ?? o.chartType ?? "bar").toLowerCase().trim();
  const type = TYPE_SYNONYMS[rawType] ?? TYPE_SYNONYMS[rawType.split(/\s+/)[0]] ?? "bar";

  const title = typeof o.title === "string" ? o.title : undefined;

  const data = Array.isArray(o.data) ? o.data.filter((r) => r && typeof r === "object") : [];
  if (data.length === 0) {
    return { error: "Chart `data` must be a non-empty array of objects." };
  }
  const rows = data as Record<string, unknown>[];
  const sample = rows[0];

  // ── Pie ────────────────────────────────────────────────────────────────
  if (type === "pie") {
    const labelKey = firstKey(sample, PIE_LABEL_KEYS) ?? Object.keys(sample).find((k) => typeof sample[k] === "string");
    const valueKey = firstKey(sample, PIE_VALUE_KEYS) ?? Object.keys(sample).find((k) => isNumericLike(sample[k]));
    if (!labelKey || !valueKey) {
      return { error: "Pie `data` items need a label and a numeric value (e.g. {label, value})." };
    }
    const normalized = rows.map((r) => ({ ...r, [valueKey]: Number(r[valueKey]) }));
    return { type, title, xKey: labelKey, series: [], data: normalized, pie: { labelKey, valueKey }, stacked: false };
  }

  // ── Cartesian (bar/line/area/scatter) ──────────────────────────────────
  const explicitX = typeof o.x === "string" ? o.x : typeof (o as Record<string, unknown>).xKey === "string" ? (o.xKey as string) : undefined;
  const xKey = explicitX ?? firstKey(sample, X_KEYS) ?? Object.keys(sample).find((k) => typeof sample[k] === "string") ?? Object.keys(sample)[0];

  // series keys: explicit y/yKeys/series, else every numeric key except xKey
  let yKeys: string[] = [];
  const explicitY = (o.y ?? (o as Record<string, unknown>).yKeys ?? o.series) as unknown;
  if (Array.isArray(explicitY)) {
    yKeys = explicitY
      .map((s) => (typeof s === "string" ? s : typeof s === "object" && s ? String((s as Record<string, unknown>).key ?? "") : ""))
      .filter(Boolean);
  } else if (typeof explicitY === "string") {
    yKeys = [explicitY];
  }
  if (yKeys.length === 0) {
    yKeys = Object.keys(sample).filter((k) => k !== xKey && isNumericLike(sample[k]));
  }
  if (yKeys.length === 0) {
    return { error: "Chart `data` rows need at least one numeric field to plot." };
  }

  // optional per-series labels/colors from a `series` array of objects
  const seriesMeta = Array.isArray(o.series) ? (o.series as unknown[]) : [];
  const series: ChartSeries[] = yKeys.map((key, i) => {
    const meta = seriesMeta.find((m) => m && typeof m === "object" && (m as Record<string, unknown>).key === key) as
      | Record<string, unknown>
      | undefined;
    return {
      key,
      label: typeof meta?.label === "string" ? meta.label : key,
      color: typeof meta?.color === "string" ? meta.color : CHART_PALETTE[i % CHART_PALETTE.length],
    };
  });

  // coerce numeric strings → numbers so recharts plots them
  const normalized = rows.map((r) => {
    const out: Record<string, unknown> = { ...r };
    for (const s of series) if (isNumericLike(out[s.key])) out[s.key] = Number(out[s.key]);
    return out;
  });

  return { type, title, xKey, series, data: normalized, stacked: Boolean(o.stacked), pie: undefined };
}
