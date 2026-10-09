"use client";

// features/spaces/data/ChartView.tsx — Notion's chart view (G1–G3): donut with the value in the
// middle, bar, horizontal bar and line, over one aggregate the store runs (`record_aggregate`).
//
// Bar / horizontal bar / line are records-ui's `ChartBlock` fed that same aggregate. The donut is drawn
// here because ChartBlock's donut has no center value (NEEDS row). Groups past 200 are cut by the store
// and the tile says so, as Notion does ("Only showing 200 options").

import { ChartBlock } from "@ai-matrx/records-ui";
import { choiceSlug, measureKey, useFields, useRecords, useRecordsClient, useRecordWrites, type AggregateMeasure, type AggregateRow, type Field, type ReadRow } from "@ai-matrx/records/react";
import { useEffect, useRef, useState } from "react";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

import type { ChartSettings } from "./sources";
import { hasListFilter, orderPoints, passes, type ChartFilter, type ChartSorts } from "./chart-rules";
import { liftWithheld } from "@ai-matrx/records";
import { useBlockSeedAnswers } from "../page/space-seed-context";
import { chartMeasure, chartTileSpecs, GROUP_LIMIT, seededChartTiles } from "./first-reads";

export type { ChartFilter, ChartSorts };

export { GROUP_LIMIT };

/** Notion's chart colors (sampled from its chart view), keyed by the store's choice color words. */
const CHOICE_HEX: Record<string, string> = {
  slate: "#b4b2ad",
  gray: "#b4b2ad",
  brown: "#b89a83",
  orange: "#d69258",
  amber: "#e9c26c",
  yellow: "#e9c26c",
  green: "#73b98f",
  teal: "#73b98f",
  blue: "#5c9be3",
  violet: "#b98fd5",
  purple: "#b98fd5",
  pink: "#e295bf",
  red: "#e08679",
};
/** Groups with no option color, in Notion's order (its Avg NPS ring reads purple, green, yellow, blue). */
const PALETTE = ["#b98fd5", "#73b98f", "#e9c26c", "#5c9be3", "#e08679", "#d69258", "#e295bf", "#b89a83", "#b4b2ad"];
/** Past a couple dozen groups Notion draws one pale color in many thin slices. */
const MANY_HEX = "#a9d6b9";

interface Choice {
  value: string;
  color?: string;
}

/** A select / status column's options, in their order (empty for any other column). */
export function choicesOfField(field: Field | undefined): Choice[] {
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

/**
 * One aggregate for the groups, one for the total (a donut's middle never counts only the first 200).
 * Both run over the view's filters (Notion: a chart counts what its view shows, never the whole table).
 */
export function useChartData(tableId: string, settings: ChartSettings, overRows = false, filter: ChartFilter = {}, sorts: ChartSorts = []): { data: ChartData | null; error: string | null; fields: Field[] } {
  const client = useRecordsClient();
  const fields = useFields(tableId).data ?? [];
  // A store with no aggregate door (the in-memory sample) is answered over read rows from the start,
  // so it is never asked — an unanswerable ask is logged by the store as a refusal.
  const listFilter = hasListFilter(filter);
  const [byRowsAsked, setByRows] = useState(overRows);
  const byRows = byRowsAsked || listFilter;
  const read = useRecords(byRows ? tableId : null, { pageSize: 1000 });
  const measure = chartMeasure(settings);
  const mKey = measureKey(measure);
  const group = settings.groupBy ?? null;
  const groupField = fields.find((f) => f.key === group);
  const choices = choicesOfField(groupField);
  // Every add, edit, archive or duplicate made on this page asks the chart again (the grid re-reads its page the same way).
  const writes = useRecordWrites();
  const ask = JSON.stringify([tableId, group, measure, settings.sort ?? "manual", Object.keys(filter).length ? filter : null, writes]);
  // The two questions (round 36: the server asks the same — page/space-page-seed.server.ts) and their
  // answers from this block's seed, when it holds them: drawn at once, never asked again.
  const specs = chartTileSpecs(settings, filter);
  const answers = useBlockSeedAnswers();
  const [seeded] = useState(() => {
    const tiles = !overRows && !listFilter ? seededChartTiles(answers, tableId, settings, filter) : null;
    if (!tiles) return null;
    const rows = liftWithheld(tiles.grouped as AggregateRow[]) as AggregateRow[];
    const whole = liftWithheld(tiles.whole as AggregateRow[]) as AggregateRow[];
    return { rows, total: whole[0]?.measures[mKey] ?? null };
  });
  const seededAsk = useRef<string | null>(seeded ? ask : null);
  const [state, setState] = useState<{ data: ChartData | null; error: string | null }>(() => ({
    data: seeded ? { points: [], total: seeded.total, truncated: seeded.rows.length >= GROUP_LIMIT, rows: seeded.rows, measure } : null,
    error: null,
  }));

  useEffect(() => {
    if (overRows || listFilter) return;
    if (seededAsk.current === ask) return;
    seededAsk.current = null;
    let gone = false;
    void (async () => {
      const [grouped, whole] = await Promise.all([client.recordAggregate({ table_id: tableId, ...specs.grouped }), client.recordAggregate({ table_id: tableId, ...specs.whole })]);
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
  }, [client, ask, overRows, listFilter]);

  let answered = listFilter ? null : state.data;
  const readRows = (read.data?.rows ?? []).filter((r) => Object.keys(filter).length === 0 || passes(r, filter));
  if (!answered && byRows && readRows.length) {
    const local = aggregateRows(readRows, group, measure, mKey);
    answered = { points: [], total: local.total, truncated: buckets(readRows, group) > GROUP_LIMIT, rows: local.rows, measure };
  }
  if (!answered && byRows && read.error) return { data: null, error: read.error.message, fields };
  if (!answered) return { data: null, error: state.error, fields };
  const groupCount = answered.rows.length;
  const points = answered.rows.map((row, i) => {
    // A number or yes/no group key comes back typed (@ai-matrx/records AggregateGroupValue); a chart names it as text.
    const g = group ? row.groups[group] : null;
    const raw = g === null || g === undefined ? null : String(g);
    const choice = choices.find((c) => c.value === raw || choiceSlug(c.value) === raw);
    const label = raw === null ? (group ? "No value" : "All") : (choice?.value ?? raw);
    const value = typeof row.measures[mKey] === "number" ? (row.measures[mKey] as number) : 0;
    const color = groupCount > 24 ? MANY_HEX : (choice?.color && CHOICE_HEX[choice.color]) || PALETTE[i % PALETTE.length];
    return { key: raw ?? `none-${i}`, label, value, color };
  });
  return { data: { ...answered, points: orderPoints(points, settings.sort, sorts, group) }, error: null, fields };
}

function buckets(rows: readonly ReadRow[], group: string | null): number {
  if (!group) return 1;
  return new Set(rows.map((r) => String((r.document as Record<string, unknown>)[group] ?? ""))).size;
}

function pretty(n: number | null): string {
  if (n === null) return "–";
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/** The donut (Notion's ring): a thin ring from 12 o'clock clockwise, a hairline gap between slices,
 *  the total in the middle in a semibold numeral. Sizes are the reference's (screenshot 1): an 80px ring,
 *  a 4px stroke, one 20px numeral for up to five characters (smaller only past that). Past a couple dozen groups the ring
 *  is Notion's dashed one: each slice a short radial tick with an equal gap after it. */
export const RING = 80;
function Donut({ data, settings }: { data: ChartData; settings: ChartSettings }) {
  const r = 37;
  const c = 2 * Math.PI * r;
  const mid = RING / 2;
  const sum = data.points.reduce((s, p) => s + Math.max(0, p.value), 0) || 1;
  const many = data.points.length > 24;
  const gap = data.points.length > 1 ? (many ? c / 400 : c / 260) : 0;
  const offsets = data.points.reduce<number[]>((acc, p, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + (Math.max(0, data.points[i - 1].value) / sum) * c);
    return acc;
  }, []);
  const center = settings.op === "count" || settings.op === "sum" ? data.total ?? sum : data.total;
  const shown = pretty(center);
  const fontSize = shown.length <= 5 ? 20 : shown.length <= 7 ? 16 : 13;
  return (
    <div className="spaces-chart-donut">
      <svg viewBox={`0 0 ${RING} ${RING}`} width={RING} height={RING} role="img" aria-label={shown}>
        {data.points.map((p, i) => {
          const offset = offsets[i];
          const len = (Math.max(0, p.value) / sum) * c;
          const dash = many ? Math.max(0.4, len * 0.5) : Math.max(0.5, len - gap);
          const el = (
            <circle
              key={p.key}
              cx={mid}
              cy={mid}
              r={r}
              fill="none"
              stroke={p.color}
              strokeWidth={many ? 5 : 4}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${mid} ${mid})`}
              strokeLinecap="butt"
            >
              <title>{`${p.label}: ${pretty(p.value)}`}</title>
            </circle>
          );
          return el;
        })}
        {settings.centerValue !== false ? (
          <text x={mid} y={mid} textAnchor="middle" dominantBaseline="central" className="spaces-chart-center" style={{ fontSize }}>
            {shown}
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

/** The aggregate rows in the order the points were sorted (the view's sort, the chart's own sort), for ChartBlock. */
function inOrder(data: ChartData): AggregateRow[] {
  const at = new Map(data.points.map((p, i) => [p.key, i]));
  const key = (row: AggregateRow, i: number) => {
    const g = Object.values(row.groups)[0];
    return g === null || g === undefined ? `none-${i}` : String(g);
  };
  const order = (row: AggregateRow, i: number) => at.get(key(row, i)) ?? i;
  return data.rows.map((row, i) => ({ row, i })).sort((a, b) => order(a.row, a.i) - order(b.row, b.i)).map((x) => x.row);
}

const RECORDS_KIND = { bar: "column", hbar: "bar", line: "line", donut: "donut" } as const;

export function ChartView({ tableId, settings, title, overRows, filter, sorts }: { tableId: string; settings: ChartSettings; title: string; overRows?: boolean; filter?: ChartFilter; sorts?: ChartSorts }) {
  const { data, error } = useChartData(tableId, settings, overRows, filter, sorts);
  if (error)
    return (
      <div role="alert" className="spaces-db-note">
        {error}
        <ErrorAlchemyMenu />
      </div>
    );
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
            rows: inOrder(data),
          }}
        />
      )}
    </div>
  );
}
