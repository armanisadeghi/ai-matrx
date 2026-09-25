/**
 * table-chart — turn a table an answer already shows (markdown table, CSV, TSV)
 * into a ChartSpec for the ONE chart primitive (chart-spec + ChartCanvas).
 * PURE: no recharts, no React — the "Chart this" button and the code-block
 * "Chart this" action both call it, and it is unit-tested on its own.
 *
 * Auto-pick (what ChatGPT's analysis charts and Excel's "Recommended charts"
 * do, reduced to the cases answers actually contain):
 *   - no numeric column                     → not chartable (the button is absent)
 *   - every column numeric                  → scatter (first column vs the rest)
 *   - category column reads as time         → line
 *   - one series, ≤ 8 rows, all ≥ 0, a share (%, "share", or sums to ~100) → pie
 *   - otherwise                             → bar
 * The reader can switch to any type the data can draw (`chartableTypes`).
 */

import { CHART_PALETTE, type ChartSpec, type ChartType } from "./chart-spec";

export interface PlainTable {
  headers: string[];
  rows: string[][];
}

const SUFFIX: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, bn: 1e9, t: 1e12 };

/** A table cell as a number, or null when it is not one. Never invents 0. */
export function parseCellNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  let s = raw.trim().replace(/^\*\*|\*\*$/g, "").replace(/^_|_$/g, "").trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/^[$€£¥₹]\s*/, "").replace(/\s*(USD|EUR|GBP)$/i, "");
  s = s.replace(/%$/, "");
  const m = /^([-+]?)(\d{1,3}(?:,\d{3})+|\d+)?(\.\d+)?\s*(k|m|bn|b|t)?$/i.exec(s);
  if (!m || (!m[2] && !m[3])) return null;
  const whole = (m[2] ?? "0").replace(/,/g, "");
  let n = Number(`${whole}${m[3] ?? ""}`);
  if (!Number.isFinite(n)) return null;
  if (m[4]) n *= SUFFIX[m[4].toLowerCase()] ?? 1;
  if (m[1] === "-") n = -n;
  return negative ? -n : n;
}

function numericColumns(table: PlainTable): number[] {
  const out: number[] = [];
  table.headers.forEach((_, col) => {
    let filled = 0;
    let numeric = 0;
    for (const row of table.rows) {
      const cell = row[col];
      if (cell == null || String(cell).trim() === "" || /^[-—–]$/.test(String(cell).trim())) continue;
      filled += 1;
      if (parseCellNumber(cell) !== null) numeric += 1;
    }
    if (filled > 0 && numeric / filled >= 0.6) out.push(col);
  });
  return out;
}

const MONTHS =
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(\s+\d{2,4})?$/i;
const TIME_HEADER = /^(year|month|date|day|week|quarter|period|time|fy|q)\b/i;

function looksTemporal(header: string, values: string[]): boolean {
  if (TIME_HEADER.test(header.trim())) return true;
  const vals = values.map((v) => String(v ?? "").trim()).filter(Boolean);
  if (vals.length < 2) return false;
  const temporal = vals.filter(
    (v) =>
      /^(19|20)\d{2}$/.test(v) ||
      MONTHS.test(v) ||
      /^q[1-4]\b/i.test(v) ||
      /^\d{4}-\d{2}(-\d{2})?$/.test(v) ||
      /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v),
  );
  return temporal.length / vals.length >= 0.8;
}

interface Shape {
  categoryCol: number | null;
  valueCols: number[];
}

function shapeOf(table: PlainTable): Shape | null {
  if (!table.headers.length || !table.rows.length) return null;
  let numeric = numericColumns(table);
  // A numeric column that is really TIME (Year, 2021/2022/…) is the category
  // axis, not a series — "Year" plotted as a value is the classic bad chart.
  // Judged by VALUES only: a header like "FY 2025/26" over dollar amounts is
  // a series, not a time axis.
  const timeCol = numeric.find((i) =>
    looksTemporal("", table.rows.map((r) => r[i])),
  );
  if (timeCol !== undefined && numeric.length > 1) {
    numeric = numeric.filter((i) => i !== timeCol);
  }
  if (numeric.length === 0) return null;
  const categoryCol =
    timeCol !== undefined && !numeric.includes(timeCol)
      ? timeCol
      : table.headers.findIndex((_, i) => !numeric.includes(i));
  return {
    categoryCol: categoryCol === -1 ? null : categoryCol,
    valueCols: numeric,
  };
}

/** The chart types this table can honestly draw, in menu order. */
export function chartableTypes(table: PlainTable): ChartType[] {
  const shape = shapeOf(table);
  if (!shape) return [];
  const types: ChartType[] = ["bar", "line", "area", "pie"];
  // Scatter needs two numeric columns (x and y).
  if (shape.valueCols.length >= 2) types.push("scatter");
  return types;
}

function autoPick(table: PlainTable, shape: Shape): ChartType {
  if (shape.categoryCol === null) return shape.valueCols.length >= 2 ? "scatter" : "bar";
  const catHeader = table.headers[shape.categoryCol] ?? "";
  const catValues = table.rows.map((r) => r[shape.categoryCol as number]);
  if (looksTemporal(catHeader, catValues)) return "line";
  if (shape.valueCols.length === 1 && table.rows.length <= 8) {
    const col = shape.valueCols[0];
    const values = table.rows.map((r) => parseCellNumber(r[col]));
    const allNonNeg = values.every((v) => v !== null && v >= 0);
    const isShare =
      /share|percent|%|portion|split|mix/i.test(table.headers[col] ?? "") ||
      table.rows.some((r) => /%\s*$/.test(String(r[col] ?? ""))) ||
      Math.abs(values.reduce<number>((a, v) => a + (v ?? 0), 0) - 100) <= 1;
    if (allNonNeg && isShare) return "pie";
  }
  return "bar";
}

/**
 * Build the ChartSpec for a table. `requested` switches the type; a type the
 * data cannot draw falls back to the auto-pick. Null = not chartable.
 */
export function tableToChartSpec(
  table: PlainTable,
  requested?: ChartType,
): ChartSpec | null {
  const shape = shapeOf(table);
  if (!shape) return null;
  const allowed = chartableTypes(table);
  let type = requested && allowed.includes(requested) ? requested : autoPick(table, shape);
  // A pie cannot draw a negative share — draw bars instead (chartNotice says why).
  if (type === "pie" && negativeRows(table, shape).length > 0) type = "bar";
  const headers = table.headers.map((h, i) => (h && h.trim()) || `Column ${i + 1}`);

  if (type === "scatter") {
    const [xCol, ...yCols] = shape.valueCols;
    const xKey = headers[xCol];
    const data = table.rows.map((row) => {
      const out: Record<string, unknown> = { [xKey]: parseCellNumber(row[xCol]) };
      for (const c of yCols) out[headers[c]] = parseCellNumber(row[c]);
      if (shape.categoryCol !== null) out[headers[shape.categoryCol]] = row[shape.categoryCol];
      return out;
    });
    return {
      type,
      xKey,
      series: yCols.map((c, i) => ({ key: headers[c], label: headers[c], color: CHART_PALETTE[i % CHART_PALETTE.length] })),
      data,
      stacked: false,
    };
  }

  const catKey = shape.categoryCol !== null ? headers[shape.categoryCol] : "#";
  const data = table.rows.map((row, i) => {
    const out: Record<string, unknown> = {
      [catKey]: shape.categoryCol !== null ? String(row[shape.categoryCol] ?? "").replace(/\*\*/g, "").trim() : String(i + 1),
    };
    for (const c of shape.valueCols) out[headers[c]] = parseCellNumber(row[c]);
    return out;
  });

  if (type === "pie") {
    const valueKey = headers[shape.valueCols[0]];
    return {
      type,
      xKey: catKey,
      series: [],
      data: data.filter((d) => typeof d[valueKey] === "number" && (d[valueKey] as number) >= 0),
      pie: { labelKey: catKey, valueKey },
      stacked: false,
    };
  }

  return {
    type,
    xKey: catKey,
    series: shape.valueCols.map((c, i) => ({
      key: headers[c],
      label: headers[c],
      color: CHART_PALETTE[i % CHART_PALETTE.length],
    })),
    data,
    stacked: false,
  };
}

function categoryLabel(table: PlainTable, shape: Shape, row: string[], i: number): string {
  return shape.categoryCol !== null
    ? String(row[shape.categoryCol] ?? "").replace(/\*\*/g, "").trim()
    : `Row ${i + 1}`;
}

function negativeRows(table: PlainTable, shape: Shape): Array<{ label: string; value: number }> {
  const col = shape.valueCols[0];
  const out: Array<{ label: string; value: number }> = [];
  table.rows.forEach((row, i) => {
    const v = parseCellNumber(row[col]);
    if (v !== null && v < 0) out.push({ label: categoryLabel(table, shape, row, i), value: v });
  });
  return out;
}

function formatNumber(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : String(n);
}

/**
 * The sentence a chart owes its reader when it cannot show every row as asked:
 * a pie over negative values (drawn as bars instead), or rows with no number
 * (not plotted). Null when the chart shows everything.
 */
export function chartNotice(table: PlainTable, requested?: ChartType): string | null {
  const shape = shapeOf(table);
  if (!shape) return null;
  const allowed = chartableTypes(table);
  const wanted = requested && allowed.includes(requested) ? requested : autoPick(table, shape);
  if (wanted === "pie") {
    const neg = negativeRows(table, shape);
    if (neg.length > 0) {
      const list = neg.map((r) => `${r.label} ${formatNumber(r.value)}`).join(", ");
      return `A pie can't show negative values (${list}), so this is drawn as bars.`;
    }
  }
  const notes: string[] = [];
  if (wanted === "pie" && shape.valueCols.length > 1) {
    const shown = table.headers[shape.valueCols[0]] ?? "the first column";
    const rest = shape.valueCols.slice(1).map((c) => table.headers[c]).join(", ");
    notes.push(`A pie shows one column — this is ${shown}; ${rest} ${shape.valueCols.length > 2 ? "are" : "is"} not shown.`);
  }
  const missing: string[] = [];
  table.rows.forEach((row, i) => {
    if (shape.valueCols.every((c) => parseCellNumber(row[c]) === null)) {
      missing.push(categoryLabel(table, shape, row, i));
    }
  });
  if (missing.length === 1) notes.push(`1 row has no number and is not plotted (${missing[0]}).`);
  else if (missing.length > 1) {
    notes.push(`${missing.length} rows have no number and are not plotted (${missing.join(", ")}).`);
  }
  return notes.length > 0 ? notes.join(" ") : null;
}

/** RFC-4180-ish CSV / TSV → table. Null when the text is not a table. */
export function parseDelimitedTable(text: string): PlainTable | null {
  const src = text.replace(/\r\n?/g, "\n").trim();
  if (!src) return null;
  const firstLine = src.split("\n", 1)[0];
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(",") ? "," : firstLine.includes(";") ? ";" : null;
  if (!delimiter) return null;
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      records.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  records.push(row);
  const cleaned = records.filter((r) => r.some((c) => c.trim() !== ""));
  if (cleaned.length < 2) return null;
  const [headers, ...rows] = cleaned;
  if (headers.length < 2) return null;
  return { headers: headers.map((h) => h.trim()), rows: rows.map((r) => r.map((c) => c.trim())) };
}
