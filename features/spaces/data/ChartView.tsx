"use client";

// features/spaces/data/ChartView.tsx — Notion's chart view (G1–G3): donut with the value in the
// middle, bar, horizontal bar and line, over one aggregate the store runs (`record_aggregate`).
//
// Bar / horizontal bar / line are records-ui's `ChartBlock` fed that same aggregate. The donut is drawn
// here because ChartBlock's donut has no center value (NEEDS row). Groups past 200 are cut by the store
// and the tile says so, as Notion does ("Only showing 200 options").

import { ChartBlock } from "@ai-matrx/records-ui";
import { choiceSlug, measureKey, useFields, useRecords, useRecordsClient, type AggregateMeasure, type AggregateRow, type Field, type ReadRow } from "@ai-matrx/records/react";
import { useEffect, useState } from "react";

import type { ChartSettings } from "./sources";

export const GROUP_LIMIT = 200;

/** Notion's option colors, mapped from the store's choice color words. */
const CHOICE_HEX: Record<string, string> = {
  slate: "#9b9a97",
  gray: "#9b9a97",
  brown: "#a27763",
  orange: "#d9730d",
  amber: "#e9a23b",
  yellow: "#dfab01",
  green: "#4dab9a",
  teal: "#4dab9a",
  blue: "#529cca",
  violet: "#9a6dd7",
  purple: "#9a6dd7",
  pink: "#e255a1",
  red: "#e16259",
};
const PALETTE = ["#529cca", "#9a6dd7", "#4dab9a", "#e9a23b", "#e16259", "#d9730d", "#e255a1", "#a27763", "#9b9a97"];

interface Choice {
  value: string;
  color?: string;
}

function choicesOfField(field: Field | undefined): Choice[] {
  const fmt: unknown = field ? (field as unknown as Record<string, unknown>)["display_format"] : null;
  if (!fmt || typeof fmt !== "object") return [];
  const options = (fmt as { options?: { choices?: unknown } }).options;
  return Array.isArray(options?.choices) ? (options.choices as Choice[]) : [];
}

export interface ChartPoint {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface ChartData {
  points: ChartPoint[];
  total: number | null;
  truncated: boolean;
  rows: AggregateRow[];
  measure: AggregateMeasure;
}

function measureOf(settings: ChartSettings): AggregateMeasure {
  return settings.op === "count" || !settings.field ? { op: "count" } : { op: settings.op, key: settings.field };
}

/** The same question answered over read rows — for a store that has no aggregate door (the in-memory
 *  sample answers reads, not `record_aggregate`). Same cut: 200 groups, total over every row. */
function aggregateRows(rows: readonly ReadRow[], group: string | null, measure: AggregateMeasure, mKey: string): { rows: AggregateRow[]; total: number | null } {
  const num = (r: ReadRow) => {
    const v = measure.key ? (r.document as Record<string, unknown>)[measure.key] : null;
    return typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null;
  };
  const reduce = (list: readonly ReadRow[]): number | null => {
    if (measure.op === "count") return list.length;
    const vals = list.map(num).filter((v): v is number => v !== null);
    if (!vals.length) return null;
    if (measure.op === "sum") return vals.reduce((a, b) => a + b, 0);
    if (measure.op === "avg") return vals.reduce((a, b) => a + b, 0) / vals.length;
    if (measure.op === "min") return Math.min(...vals);
    if (measure.op === "max") return Math.max(...vals);
    return null;
  };
  const buckets = new Map<string | null, ReadRow[]>();
  for (const r of rows) {
    const raw = group ? (r.document as Record<string, unknown>)[group] : null;
    const k = raw === null || raw === undefined || raw === "" ? null : String(raw);
    buckets.set(k, [...(buckets.get(k) ?? []), r]);
  }
  const out: AggregateRow[] = [...buckets.entries()].slice(0, GROUP_LIMIT).map(([k, list]) => ({
    groups: group ? { [group]: k } : {},
    measures: { [mKey]: reduce(list) },
    row_count: list.length,
  }));
  return { rows: out, total: reduce(rows) };
}

/** One aggregate for the groups, one for the total (a donut's middle never counts only the first 200). */
export function useChartData(tableId: string, settings: ChartSettings): { data: ChartData | null; error: string | null; fields: Field[] } {
  const client = useRecordsClient();
  const fields = useFields(tableId).data ?? [];
  const [state, setState] = useState<{ data: ChartData | null; error: string | null }>({ data: null, error: null });
  const [byRows, setByRows] = useState(false);
  const read = useRecords(byRows ? tableId : null, { pageSize: 1000 });
  const measure = measureOf(settings);
  const mKey = measureKey(measure);
  const group = settings.groupBy ?? null;
  const groupField = fields.find((f) => f.key === group);
  const choices = choicesOfField(groupField);
  const ask = JSON.stringify([tableId, group, measure, settings.sort ?? "manual"]);

  useEffect(() => {
    let gone = false;
    void (async () => {
      const [grouped, whole] = await Promise.all([
        client.recordAggregate({ table_id: tableId, groupBy: group ? [group] : [], measures: [measure], limit: GROUP_LIMIT }),
        client.recordAggregate({ table_id: tableId, measures: [measure] }),
      ]);
      if (gone) return;
      if (!grouped.ok) {
        if (/does not answer record_aggregate/i.test(grouped.error.message)) setByRows(true);
        else setState({ data: null, error: grouped.error.message });
        return;
      }
      const rows = grouped.data;
      const total = whole.ok ? (whole.data[0]?.measures[mKey] ?? null) : null;
      setState({ data: { points: [], total, truncated: rows.length >= GROUP_LIMIT, rows, measure }, error: null });
    })();
    return () => {
      gone = true;
    };
    // `ask` carries every input of the question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, ask]);

  let answered = state.data;
  const readRows = read.data?.rows ?? [];
  if (!answered && byRows && readRows.length) {
    const local = aggregateRows(readRows, group, measure, mKey);
    answered = { points: [], total: local.total, truncated: buckets(readRows, group) > GROUP_LIMIT, rows: local.rows, measure };
  }
  if (!answered && byRows && read.error) return { data: null, error: read.error.message, fields };
  if (!answered) return { data: null, error: state.error, fields };
  const points = answered.rows.map((row, i) => {
    const raw = group ? (row.groups[group] ?? null) : null;
    const choice = choices.find((c) => c.value === raw || choiceSlug(c.value) === raw);
    const label = raw === null ? (group ? "No value" : "All") : (choice?.value ?? raw);
    const value = typeof row.measures[mKey] === "number" ? (row.measures[mKey] as number) : 0;
    const color = (choice?.color && CHOICE_HEX[choice.color]) || PALETTE[i % PALETTE.length];
    return { key: raw ?? `none-${i}`, label, value, color };
  });
  if (settings.sort === "asc") points.sort((a, b) => a.value - b.value);
  if (settings.sort === "desc") points.sort((a, b) => b.value - a.value);
  return { data: { ...answered, points }, error: null, fields };
}

function buckets(rows: readonly ReadRow[], group: string | null): number {
  if (!group) return 1;
  return new Set(rows.map((r) => String((r.document as Record<string, unknown>)[group] ?? ""))).size;
}

function pretty(n: number | null): string {
  if (n === null) return "–";
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/** The donut: one ring, a 1.5° gap between slices, the total in the middle. */
function Donut({ data, settings }: { data: ChartData; settings: ChartSettings }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const sum = data.points.reduce((s, p) => s + Math.max(0, p.value), 0) || 1;
  const many = data.points.length > 24;
  const gap = data.points.length > 1 ? (many ? c / 720 : c / 240) : 0;
  let offset = 0;
  const center = settings.op === "count" || settings.op === "sum" ? data.total ?? sum : data.total;
  return (
    <div className="spaces-chart-donut">
      <svg viewBox="0 0 140 140" role="img" aria-label={`${pretty(center)}`}>
        {data.points.map((p) => {
          const len = (Math.max(0, p.value) / sum) * c;
          const dash = Math.max(0.5, len - gap);
          const el = (
            <circle
              key={p.key}
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={p.color}
              strokeWidth={many ? 6 : 9}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 70 70)"
              strokeLinecap="butt"
            >
              <title>{`${p.label}: ${pretty(p.value)}`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
        {settings.centerValue !== false ? (
          <text x="70" y="70" textAnchor="middle" dominantBaseline="central" className="spaces-chart-center">
            {pretty(center)}
          </text>
        ) : null}
      </svg>
      {settings.legend ? (
        <ul className="spaces-chart-legend">
          {data.points.slice(0, 12).map((p) => (
            <li key={p.key}>
              <span style={{ background: p.color }} />
              {p.label}
              {settings.dataLabels ? <em>{pretty(p.value)}</em> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const RECORDS_KIND = { bar: "column", hbar: "bar", line: "line", donut: "donut" } as const;

export function ChartView({ tableId, settings, title }: { tableId: string; settings: ChartSettings; title: string }) {
  const { data, error } = useChartData(tableId, settings);
  if (error) return <p className="spaces-db-note">{error}</p>;
  if (!data) return <div className="spaces-chart-loading" />;
  return (
    <div className="spaces-chart">
      {data.truncated ? <div className="spaces-chart-overflow">Only showing {GROUP_LIMIT} options</div> : null}
      {settings.type === "donut" ? (
        <Donut data={data} settings={settings} />
      ) : (
        <ChartBlock
          subject={tableId}
          block={{
            title,
            kind: RECORDS_KIND[settings.type],
            table_id: tableId,
            group_by: settings.groupBy ? [settings.groupBy] : [],
            measures: [data.measure],
            rows: data.rows,
          }}
        />
      )}
    </div>
  );
}
