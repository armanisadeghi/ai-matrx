// features/make/gallery/TemplateShowcase.tsx — lane CHAIR-GALLERY (Unified Data System v7), 2026-10-05.
//
// A TEMPLATE, SHOWN. Arman: "This should SHOW you actual data so you can visualize what it is."
// Every published template carries its own invented business and sample rows; this file draws them
// read-only, straight from the spec in memory — the tables as a grid, the board / calendar / timeline /
// gallery views it declares.
// No install, no store read, no store write.
//
// Round 2 (lane CHAIR-GALLERY-2): the main view and the tables are now the SERVER SKELETON of
// TemplateLivePreview, which swaps in the real records-ui screens on the in-memory store once loaded.
// Round 3 (lane CHAIR-GALLERY-3): the forms, booking pages and dashboards are drawn ONLY by the real
// screens (FormRunner, BookingPicker, DashboardCanvas) — this file keeps just the crawlable fallback
// (main view + table grids) and the card thumbnail. One renderer per thing.
//
// Server-safe on purpose (no hooks, no "use client"): /templates/<slug> renders it on the server, so a
// crawler reads the table names and the sample rows as HTML. TemplateThumb is the gallery card's live
// thumbnail, drawn from the main table's first rows the public door hands each card.

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { formatUsd } from "@ai-matrx/kit/format";

import type { GalleryThumb } from "./catalogue";
import { TemplateLivePreview } from "./TemplateLivePreview";

// ─────────────────────────────────────────────────────────────────────────────
// The spec as this file reads it (a structural subset of TemplateSpec in @ai-matrx/records/templates).
// ─────────────────────────────────────────────────────────────────────────────

export interface ShowField {
  key: string;
  label: string;
  parityType: string;
  choices?: string[];
  choiceColors?: Record<string, string>;
  relationTarget?: string;
  help?: string;
}
export interface ShowRow {
  key: string;
  values: Record<string, unknown>;
}
export interface ShowTable {
  token: string;
  name: string;
  labelSingular?: string;
  labelPlural?: string;
  describes?: string;
  titleField?: string;
  fields: ShowField[];
  rows?: ShowRow[];
}
export interface ShowView {
  token: string;
  name: string;
  table: string;
  kind: "grid" | "kanban" | "calendar" | "timeline" | "gallery" | string;
  groupBy?: string;
  dateField?: string;
  startField?: string;
  endField?: string;
  filters?: Record<string, unknown>;
  sorts?: Array<{ field: string; direction: "asc" | "desc" }>;
  isDefault?: boolean;
}
export interface ShowFormField {
  fieldKey: string;
  ask?: string;
  help?: string;
  required?: boolean;
}
export interface ShowForm {
  token: string;
  name: string;
  describes?: string;
  table: string;
  fields: ShowFormField[];
  submitLabel?: string;
}
export interface ShowBlock {
  title: string;
  kind: string;
  groupBy?: string[];
  measures?: Array<{ op: string; key?: string }>;
  bucket?: { key: string; by: string };
  filter?: Record<string, unknown>;
  span?: number;
}
export interface ShowExtra {
  kind: string;
  token: string;
  name?: string;
  title?: string;
  describes?: string;
  table?: string;
  blocks?: ShowBlock[];
  questions?: ShowFormField[];
  availability?: { timezone?: string; slotMinutes?: number; days?: number; windows?: Array<{ weekday: number; from: string; to: string }> };
}
export interface ShowSpec {
  id: string;
  useCase?: string;
  business?: { name?: string; describes?: string; address?: { city?: string; region?: string }; timezone?: string };
  tables: ShowTable[];
  sharedBlocks?: Array<{ block: string; rows?: ShowRow[] }>;
  views?: ShowView[];
  forms?: ShowForm[];
  extras?: ShowExtra[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Values
// ─────────────────────────────────────────────────────────────────────────────

const CHIP: Record<string, string> = {
  blue: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  violet: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  teal: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  slate: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  red: "bg-red-500/15 text-red-700 dark:text-red-300",
  orange: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  pink: "bg-pink-500/15 text-pink-700 dark:text-pink-300",
  gray: "bg-muted text-muted-foreground",
};
const BAR: Record<string, string> = {
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  green: "bg-emerald-500",
  violet: "bg-violet-500",
  teal: "bg-teal-500",
  slate: "bg-slate-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  pink: "bg-pink-500",
};
const BAR_CYCLE = ["bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500", "bg-teal-500", "bg-red-500", "bg-slate-500"];

/** A key → a row's name, across every table and shared block (relations and members read it). */
export type Names = Map<string, string>;

export function namesOf(spec: ShowSpec): Names {
  const names: Names = new Map();
  for (const block of spec.sharedBlocks ?? []) {
    for (const r of block.rows ?? []) {
      const v = r.values;
      const name = v.full_name ?? v.name ?? Object.values(v).find((x) => typeof x === "string");
      if (typeof name === "string") names.set(r.key, name);
    }
  }
  for (const t of spec.tables) {
    for (const r of t.rows ?? []) {
      const title = t.titleField ? r.values[t.titleField] : undefined;
      if (typeof title === "string") names.set(r.key, title);
    }
  }
  return names;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function dateText(value: string): string {
  if (DATE_ONLY.test(value)) {
    return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The day a value falls on ("YYYY-MM-DD"), or null. */
function dayOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return m ? m[1] : null;
}

function Chip({ color, children }: { color?: string; children: ReactNode }) {
  return <span className={cn("inline-flex max-w-full truncate rounded px-1.5 py-0.5 type-meta font-medium", CHIP[color ?? "gray"] ?? CHIP.gray)}>{children}</span>;
}

export function ValueText({ field, value, names }: { field: ShowField | undefined; value: unknown; names: Names }): ReactNode {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground/60">—</span>;
  const type = field?.parityType ?? "text";
  if (type === "select" && typeof value === "string") return <Chip color={field?.choiceColors?.[value]}>{value}</Chip>;
  if (type === "multi_select" && Array.isArray(value)) {
    return (
      <span className="flex flex-wrap gap-1">
        {value.map((v) => (
          <Chip key={String(v)} color={field?.choiceColors?.[String(v)]}>
            {String(v)}
          </Chip>
        ))}
      </span>
    );
  }
  if (type === "relation" || type === "member") {
    const keys = Array.isArray(value) ? value : [value];
    return <span>{keys.map((k) => names.get(String(k)) ?? String(k)).join(", ")}</span>;
  }
  if (type === "checkbox") return <span>{value ? "Yes" : "No"}</span>;
  if (type === "currency" && typeof value === "number") return <span className="tabular-nums">{formatUsd(value, { digits: "whole" })}</span>;
  if (type === "percent" && typeof value === "number") return <span className="tabular-nums">{value}%</span>;
  if ((type === "number" || type === "integer" || type === "decimal") && typeof value === "number") {
    return <span className="tabular-nums">{value.toLocaleString("en-US")}</span>;
  }
  if (type === "datetime" && typeof value === "string") return <span className="tabular-nums">{dateText(value)}</span>;
  if (typeof value === "string" && DATE_ONLY.test(value)) return <span className="tabular-nums">{dateText(value)}</span>;
  if (Array.isArray(value)) return <span>{value.map(String).join(", ")}</span>;
  if (typeof value === "object") return <span className="text-muted-foreground/60">—</span>;
  return <span>{String(value)}</span>;
}

const NOT_IN_GRID = new Set(["long_text", "attachment", "signature", "formula", "rollup", "lookup", "entity_reference"]);

function gridFields(table: ShowTable, max = 7): ShowField[] {
  const shown = table.fields.filter((f) => !NOT_IN_GRID.has(f.parityType));
  const title = shown.find((f) => f.key === table.titleField);
  const rest = shown.filter((f) => f !== title);
  return (title ? [title, ...rest] : rest).slice(0, max);
}

function titleOf(table: ShowTable, row: ShowRow): string {
  const v = table.titleField ? row.values[table.titleField] : undefined;
  return typeof v === "string" ? v : row.key;
}

function viewRows(table: ShowTable, view: ShowView | null): ShowRow[] {
  let rows = [...(table.rows ?? [])];
  if (view?.filters) {
    for (const [k, want] of Object.entries(view.filters)) {
      rows = rows.filter((r) => (Array.isArray(want) ? want.includes(r.values[k]) : r.values[k] === want));
    }
  }
  const sort = view?.sorts?.[0];
  if (sort) {
    const dir = sort.direction === "desc" ? -1 : 1;
    rows.sort((a, b) => {
      const x = a.values[sort.field];
      const y = b.values[sort.field];
      if (x === y) return 0;
      if (x === undefined || x === null) return 1;
      if (y === undefined || y === null) return -1;
      return (x > y ? 1 : -1) * dir;
    });
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Views
// ─────────────────────────────────────────────────────────────────────────────

function Frame({ title, meta, children, attr }: { title: string; meta?: string; children: ReactNode; attr?: string }) {
  return (
    <section className="flex min-w-0 flex-col gap-2" {...(attr ? { [attr]: "" } : {})}>
      <div className="flex min-w-0 items-baseline gap-2">
        <h3 className="truncate type-title text-foreground">{title}</h3>
        {meta ? <span className="shrink-0 type-secondary text-muted-foreground">{meta}</span> : null}
      </div>
      <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">{children}</div>
    </section>
  );
}

export function GridShow({ table, view, names, limit = 12 }: { table: ShowTable; view: ShowView | null; names: Names; limit?: number }) {
  const fields = gridFields(table);
  const rows = viewRows(table, view);
  return (
    <div className="overflow-x-auto" data-template-show="grid">
      <table className="w-full min-w-[36rem] border-collapse text-left type-secondary">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            {fields.map((f) => (
              <th key={f.key} scope="col" className="whitespace-nowrap border-b border-border px-3 py-2 font-medium">
                {f.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map((r) => (
            <tr key={r.key} className="border-b border-border/60 last:border-0">
              {fields.map((f, i) => (
                <td key={f.key} className={cn("max-w-[16rem] truncate px-3 py-1.5", i === 0 && "font-medium text-foreground")}>
                  <ValueText field={f} value={r.values[f.key]} names={names} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > limit ? <p className="border-t border-border px-3 py-1.5 type-meta text-muted-foreground">{rows.length - limit} more rows</p> : null}
    </div>
  );
}

function cardFields(table: ShowTable, skip: Array<string | undefined>): ShowField[] {
  return gridFields(table, 10)
    .filter((f) => f.key !== table.titleField && !skip.includes(f.key))
    .slice(0, 2);
}

function RecordCard({ table, row, names, skip = [] }: { table: ShowTable; row: ShowRow; names: Names; skip?: Array<string | undefined> }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-background p-2 shadow-sm">
      <span className="truncate type-secondary font-medium text-foreground">{titleOf(table, row)}</span>
      {cardFields(table, skip).map((f) => (
        <span key={f.key} className="truncate type-meta text-muted-foreground">
          <ValueText field={f} value={row.values[f.key]} names={names} />
        </span>
      ))}
    </div>
  );
}

export function KanbanShow({ table, view, names }: { table: ShowTable; view: ShowView; names: Names }) {
  const field = table.fields.find((f) => f.key === view.groupBy);
  const rows = viewRows(table, view);
  const lanes = field?.choices?.length ? field.choices : [...new Set(rows.map((r) => String(r.values[view.groupBy ?? ""] ?? "")))];
  return (
    <div className="flex gap-2 overflow-x-auto p-2" data-template-show="kanban">
      {lanes.map((lane) => {
        const inLane = rows.filter((r) => String(r.values[view.groupBy ?? ""] ?? "") === lane);
        return (
          <div key={lane} className="flex w-56 shrink-0 flex-col gap-1.5 rounded-lg bg-muted/40 p-1.5">
            <div className="flex items-center justify-between gap-2 px-1">
              <Chip color={field?.choiceColors?.[lane]}>{lane || "None"}</Chip>
              <span className="type-meta tabular-nums text-muted-foreground">{inLane.length}</span>
            </div>
            {inLane.slice(0, 5).map((r) => (
              <RecordCard key={r.key} table={table} row={r} names={names} skip={[view.groupBy]} />
            ))}
            {inLane.length > 5 ? <span className="px-1 type-meta text-muted-foreground">{inLane.length - 5} more</span> : null}
          </div>
        );
      })}
    </div>
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarShow({ table, view, today }: { table: ShowTable; view: ShowView; today: string }) {
  const key = view.dateField ?? view.startField ?? "";
  const rows = viewRows(table, view);
  const byDay = new Map<string, ShowRow[]>();
  for (const r of rows) {
    const d = dayOf(r.values[key]);
    if (d) byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }
  const [y, m] = today.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const cells: Array<string | null> = [...Array(lead).fill(null)];
  for (let d = 1; d <= daysIn; d++) cells.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return (
    <div data-template-show="calendar">
      <div className="border-b border-border px-3 py-1.5 type-secondary font-medium text-foreground">
        {first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
      </div>
      <div className="grid grid-cols-7 type-meta">
        {WEEKDAYS.map((w) => (
          <div key={w} className="border-b border-border px-1.5 py-1 text-muted-foreground">
            {w}
          </div>
        ))}
        {cells.map((day, i) => {
          const items = day ? (byDay.get(day) ?? []) : [];
          return (
            <div key={day ?? `pad-${i}`} className={cn("min-h-16 min-w-0 border-b border-r border-border/60 p-1", !day && "bg-muted/30")}>
              {day ? (
                <span className={cn("tabular-nums", day === today ? "rounded bg-primary px-1 text-primary-foreground" : "text-muted-foreground")}>
                  {Number(day.slice(8))}
                </span>
              ) : null}
              {items.slice(0, 2).map((r) => (
                <span key={r.key} className="mt-0.5 block truncate rounded bg-primary/10 px-1 text-primary-ink">
                  {titleOf(table, r)}
                </span>
              ))}
              {items.length > 2 ? <span className="block text-muted-foreground">+{items.length - 2}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const DAY_MS = 86_400_000;

export function TimelineShow({ table, view }: { table: ShowTable; view: ShowView }) {
  const startKey = view.startField ?? view.dateField ?? "";
  const endKey = view.endField ?? startKey;
  const bars = viewRows(table, view)
    .map((r) => {
      const s = dayOf(r.values[startKey]);
      const e = dayOf(r.values[endKey]) ?? s;
      return s ? { row: r, start: Date.parse(`${s}T00:00:00Z`), end: Date.parse(`${e}T00:00:00Z`) + DAY_MS } : null;
    })
    .filter((b): b is { row: ShowRow; start: number; end: number } => b !== null)
    .sort((a, b) => a.start - b.start)
    .slice(0, 14);
  if (!bars.length) return <p className="p-3 type-secondary text-muted-foreground">No dated rows</p>;
  const lo = Math.min(...bars.map((b) => b.start));
  const hi = Math.max(...bars.map((b) => b.end));
  const span = Math.max(hi - lo, DAY_MS);
  const group = table.fields.find((f) => f.key === view.groupBy);
  return (
    <div className="flex flex-col gap-1 p-3" data-template-show="timeline">
      <div className="flex justify-between type-meta text-muted-foreground">
        <span>{dateText(new Date(lo).toISOString().slice(0, 10))}</span>
        <span>{dateText(new Date(hi - DAY_MS).toISOString().slice(0, 10))}</span>
      </div>
      {bars.map((b, i) => {
        const g = group ? String(b.row.values[group.key] ?? "") : "";
        const color = (group?.choiceColors?.[g] && BAR[group.choiceColors[g]]) || BAR_CYCLE[i % BAR_CYCLE.length];
        return (
          <div key={b.row.key} className="flex min-w-0 items-center gap-2">
            <span className="w-40 shrink-0 truncate type-meta text-foreground">{titleOf(table, b.row)}</span>
            <div className="relative h-4 min-w-0 flex-1 rounded bg-muted/50">
              <span
                className={cn("absolute top-0 h-4 rounded", color)}
                style={{ left: `${((b.start - lo) / span) * 100}%`, width: `${Math.max(((b.end - b.start) / span) * 100, 1.5)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function GalleryShow({ table, view, names }: { table: ShowTable; view: ShowView; names: Names }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2 p-2" data-template-show="gallery">
      {viewRows(table, view)
        .slice(0, 8)
        .map((r) => (
          <div key={r.key} className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-background">
            <div className="flex h-16 items-center justify-center bg-gradient-to-br from-primary/15 to-primary/5 text-lg font-semibold text-primary/70">
              {titleOf(table, r).slice(0, 1)}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5 p-2">
              <span className="truncate type-secondary font-medium">{titleOf(table, r)}</span>
              {cardFields(table, []).map((f) => (
                <span key={f.key} className="truncate type-meta text-muted-foreground">
                  <ValueText field={f} value={r.values[f.key]} names={names} />
                </span>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

function ViewShow({ table, view, names, today }: { table: ShowTable; view: ShowView; names: Names; today: string }) {
  switch (view.kind) {
    case "kanban":
      return <KanbanShow table={table} view={view} names={names} />;
    case "calendar":
      return <CalendarShow table={table} view={view} today={today} />;
    case "timeline":
      return <TimelineShow table={table} view={view} />;
    case "gallery":
      return <GalleryShow table={table} view={view} names={names} />;
    default:
      return <GridShow table={table} view={view} names={names} />;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Forms, booking, dashboards
// ─────────────────────────────────────────────────────────────────────────────

const EXTRA_WORD: Record<string, string> = {
  portal: "Client portal",
  checklist: "Checklist",
  document: "Document",
  digest: "Digest",
  notification: "Notification",
  row_action: "Row action",
  stage_rules: "Stage rules",
  drill_down: "Drill-down",
  automation: "Automation",
};

/** The template's main view: the first table's first board, calendar, timeline or gallery, else its grid. */
export function mainViewOf(spec: ShowSpec): { table: ShowTable; view: ShowView | null } | null {
  const table = spec.tables[0];
  if (!table) return null;
  const views = (spec.views ?? []).filter((v) => v.table === table.token);
  return { table, view: views.find((v) => v.kind !== "grid") ?? views.find((v) => v.isDefault) ?? null };
}

export function TemplateShowcase({ spec, today }: { spec: ShowSpec; today: string }) {
  const names = namesOf(spec);
  const main = mainViewOf(spec);
  const extras = spec.extras ?? [];
  const rest = extras.filter((e) => EXTRA_WORD[e.kind]);

  return (
    <div className="flex flex-col gap-8" data-template-showcase={spec.id}>
      <TemplateLivePreview spec={spec as unknown as Parameters<typeof TemplateLivePreview>[0]["spec"]} today={today}>
        <div className="flex flex-col gap-8">
        {main ? (
          <Frame title={main.view?.name ?? main.table.name} meta={main.table.name} attr="data-template-main-view">
            {main.view ? <ViewShow table={main.table} view={main.view} names={names} today={today} /> : <GridShow table={main.table} view={null} names={names} />}
          </Frame>
        ) : null}

        <section className="flex flex-col gap-4" aria-labelledby="template-tables">
          <h2 id="template-tables" className="text-lg font-semibold tracking-tight">
            Tables
          </h2>
          {spec.tables.map((t) => (
            <Frame key={t.token} title={t.name} meta={`${t.rows?.length ?? 0} sample rows · ${t.fields.length} columns`} attr="data-template-table">
              {t.describes ? <p className="border-b border-border px-3 py-2 type-secondary text-muted-foreground">{t.describes}</p> : null}
              <GridShow table={t} view={(spec.views ?? []).find((v) => v.table === t.token && v.kind === "grid") ?? null} names={names} />
            </Frame>
          ))}
        </section>
        </div>
      </TemplateLivePreview>

      {rest.length ? (
        <section className="flex flex-col gap-2" aria-labelledby="template-more">
          <h2 id="template-more" className="text-lg font-semibold tracking-tight">
            Also included
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {rest.map((e) => (
              <li key={e.token} className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border bg-card px-3 py-2">
                <span className="truncate type-title">{e.name ?? e.title ?? e.token}</span>
                <span className="type-meta text-muted-foreground">{EXTRA_WORD[e.kind]}</span>
                {e.describes ? <span className="line-clamp-2 type-secondary text-muted-foreground">{e.describes}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** A gallery card's live thumbnail: the main table's first rows as a tiny grid. */
export function TemplateThumb({ thumb }: { thumb: GalleryThumb | null | undefined }) {
  if (!thumb || !thumb.columns.length) return null;
  const names: Names = new Map();
  return (
    <div className="pointer-events-none overflow-hidden rounded-md border border-border bg-background" aria-hidden="true" data-template-thumb="">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-2 py-1">
        <span className="truncate type-meta font-medium text-foreground">{thumb.table}</span>
        {thumb.view ? <span className="shrink-0 type-meta text-muted-foreground">{VIEW_WORD[thumb.view] ?? thumb.view}</span> : null}
      </div>
      <table className="w-full table-fixed type-meta">
        <tbody>
          {thumb.rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              {thumb.columns.map((c, j) => (
                <td key={c.key} className={cn("truncate px-2 py-0.5", j === 0 ? "w-1/2 text-foreground" : "text-muted-foreground")}>
                  <ValueText
                    field={{ key: c.key, label: c.label, parityType: c.type, choiceColors: c.colors ?? undefined }}
                    value={typeof r[c.key] === "string" && String(r[c.key]).startsWith("@") ? null : r[c.key]}
                    names={names}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const VIEW_WORD: Record<string, string> = { kanban: "Board", calendar: "Calendar", timeline: "Timeline", gallery: "Gallery" };
