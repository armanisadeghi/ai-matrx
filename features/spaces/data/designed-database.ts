// features/spaces/data/designed-database.ts — the Database Designer's result (mandate `spaces.design_database`)
// made real: the design JSON is read strictly, its properties become the table's fields (choices with their
// colours, through the field's `display_format` — the same shape the template installs write), its rows are written
// in one call, and its views become the database block's own views. Also the other way round: an existing
// database read back as the markdown the agent's `current_design` input expects ("Redesign with AI").

import { createRecordsClient, declareTable, supabaseDataSource, tokenFor, type RecordsClient } from "@ai-matrx/records/core";

import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { createClient } from "@/utils/supabase/client";

import { pageOrganizationId } from "./agency-install";
import { newViewId, type ChartSettings, type SpaceDbView, type SpaceViewLayout } from "./sources";
import type { PickedSource } from "./SourcePicker";

export const DESIGN_TYPES = ["text", "number", "currency", "percent", "select", "multi_select", "status", "date", "checkbox", "url", "email", "phone"] as const;
export type DesignType = (typeof DESIGN_TYPES)[number];
export const DESIGN_COLORS = ["slate", "green", "amber", "red", "blue", "violet", "teal", "orange", "yellow", "pink", "brown", "gray"] as const;

export interface DesignOption {
  name: string;
  color: string;
}
export interface DesignProperty {
  key: string;
  name: string;
  type: DesignType;
  options: DesignOption[];
}
export interface DesignView {
  name: string;
  layout: "table" | "board" | "chart" | "calendar";
  group_by: string | null;
  chart: { type: ChartSettings["type"]; group_by: string | null; op: "count" | "sum" | "avg"; field: string | null } | null;
}
export interface DatabaseDesign {
  name: string;
  title_property: string;
  properties: DesignProperty[];
  views: DesignView[];
  rows: Array<Record<string, unknown>>;
  summary: string;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const isChoice = (t: DesignType) => t === "select" || t === "multi_select" || t === "status";

/** The agent's JSON, read strictly enough to build from. Throws, by name, on a design nothing can be made of. */
export function readDesign(value: unknown): DatabaseDesign {
  const v = (value && typeof value === "object" ? value : null) as Record<string, unknown> | null;
  if (!v) throw new Error("The designer finished without a design");
  const seen = new Set<string>();
  const properties: DesignProperty[] = [];
  for (const raw of Array.isArray(v.properties) ? v.properties : []) {
    const p = raw as Record<string, unknown>;
    const name = str(p.name);
    const type = (DESIGN_TYPES as readonly string[]).includes(str(p.type)) ? (str(p.type) as DesignType) : "text";
    const key = tokenFor(str(p.key) || name);
    if (!name || !key || seen.has(key)) continue;
    seen.add(key);
    const options = (Array.isArray(p.options) ? p.options : [])
      .map((o) => (typeof o === "string" ? { name: o.trim(), color: "gray" } : { name: str((o as DesignOption).name), color: str((o as DesignOption).color) }))
      .filter((o) => o.name)
      .map((o) => ({ name: o.name, color: (DESIGN_COLORS as readonly string[]).includes(o.color) ? o.color : "gray" }));
    properties.push({ key, name, type, options: isChoice(type) ? options : [] });
  }
  if (!properties.length) throw new Error("The design has no properties");
  const titleKey = tokenFor(str(v.title_property));
  const title = properties.find((p) => p.key === titleKey) ?? properties.find((p) => p.type === "text") ?? properties[0];
  const keyOf = (x: unknown) => {
    const k = tokenFor(str(x));
    return properties.find((p) => p.key === k || tokenFor(p.name) === k)?.key ?? null;
  };
  const views: DesignView[] = (Array.isArray(v.views) ? v.views : []).map((raw) => {
    const w = raw as Record<string, unknown>;
    const layout = (["table", "board", "chart", "calendar"] as const).find((l) => l === str(w.layout)) ?? "table";
    const c = (w.chart && typeof w.chart === "object" ? w.chart : null) as Record<string, unknown> | null;
    const chartType = (["donut", "bar", "hbar", "line"] as const).find((t) => t === str(c?.type)) ?? "donut";
    const op = (["count", "sum", "avg"] as const).find((o) => o === str(c?.op)) ?? "count";
    return {
      name: str(w.name) || layout[0].toUpperCase() + layout.slice(1),
      layout,
      group_by: keyOf(w.group_by),
      chart: layout === "chart" ? { type: chartType, group_by: keyOf(c?.group_by ?? w.group_by), op, field: op === "count" ? null : keyOf(c?.field) } : null,
    };
  });
  // A row is `{cells: [{property, value}]}` (the agent's strict output) or a plain `{<key>: value}` map.
  const rows = (Array.isArray(v.rows) ? v.rows : [])
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r))
    .map((r) =>
      Array.isArray(r.cells)
        ? Object.fromEntries((r.cells as Array<Record<string, unknown>>).map((c) => [keyOf(c.property) ?? str(c.property), c.value]))
        : r,
    );
  return {
    name: str(v.name) || "Untitled database",
    title_property: title.key,
    properties: [title, ...properties.filter((p) => p !== title)],
    views: views.length ? views : [{ name: "Table", layout: "table", group_by: null, chart: null }],
    rows,
    summary: str(v.summary),
  };
}

type NewFieldSpec = NonNullable<Parameters<typeof declareTable>[1]["fields"]>[number];

/** One property as the records door declares it (choices wear their colours through `display_format`, as the template installs write). */
export function fieldSpec(p: DesignProperty, sort: number): NewFieldSpec {
  const choice = isChoice(p.type);
  const type = p.type === "status" ? "select" : p.type === "date" ? "datetime" : p.type;
  return {
    key: p.key,
    label: p.name,
    type: type as NewFieldSpec["type"],
    sort,
    required: false,
    ...(p.type === "date" ? { kind: "date" as const } : {}),
    ...(choice && p.options.length ? { options: p.options.map((o) => o.name) } : {}),
    ...(choice && p.options.length
      ? { declaration: { display_format: { id: p.type === "multi_select" ? "multi_choice" : "choice", options: { choices: p.options.map((o) => ({ value: o.name, color: o.color })) } } } }
      : {}),
  };
}

/** One sample row, every value kept only when it fits its property (a choice outside the options is dropped). */
export function rowData(design: DatabaseDesign, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of design.properties) {
    const raw = row[p.key] ?? row[p.name];
    if (raw === undefined || raw === null || raw === "") continue;
    const names = p.options.map((o) => o.name);
    if (p.type === "multi_select") {
      const list = (Array.isArray(raw) ? raw : String(raw).split(",")).map((x) => String(x).trim()).filter((x) => names.includes(x));
      if (list.length) out[p.key] = list;
    } else if (p.type === "select" || p.type === "status") {
      if (names.includes(String(raw))) out[p.key] = String(raw);
    } else if (p.type === "number" || p.type === "currency" || p.type === "percent") {
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(n)) out[p.key] = n;
    } else if (p.type === "checkbox") {
      out[p.key] = raw === true || raw === "true" || raw === "Yes" || raw === "yes";
    } else {
      out[p.key] = String(raw);
    }
  }
  return out;
}

/** The design's views as the database block's own views. */
export function blockViews(design: DatabaseDesign): SpaceDbView[] {
  const firstChoice = design.properties.find((p) => p.type === "status" || p.type === "select")?.key ?? null;
  const firstDate = design.properties.find((p) => p.type === "date")?.key ?? null;
  return design.views.map((v) => {
    const layout: SpaceViewLayout = v.layout === "table" ? "grid" : v.layout === "board" ? "kanban" : v.layout;
    const base: SpaceDbView = { id: newViewId(), name: v.name, layout };
    if (layout === "kanban") return { ...base, groupField: v.group_by ?? firstChoice };
    if (layout === "calendar") return { ...base, dateField: v.group_by ?? firstDate };
    if (layout === "chart" && v.chart) {
      return { ...base, chart: { type: v.chart.type, groupBy: v.chart.group_by ?? firstChoice, op: v.chart.op, field: v.chart.field, centerValue: v.chart.type === "donut", legend: true } };
    }
    return base;
  });
}

async function clientFor(spaceId: string | null, activeOrg: string | null, userId: string | null): Promise<RecordsClient> {
  // org-filter: write-target the page's organization; the active one only for a page not saved yet.
  const organizationId = (spaceId ? await pageOrganizationId(spaceId) : null) ?? (await ensureOrgId(activeOrg));
  return createRecordsClient({
    dataSource: supabaseDataSource(createClient()),
    actor: userId ? { actor: "user", user_id: userId } : { actor: "user" },
    organizationId,
  });
}

/**
 * Ids that keep the rows in the order they were handed in (review 8041caec, 2026-10-07: a moved-in
 * Notion table came back Bulb, Green, Hilltop instead of the source's Green, Bulb, Hilltop). One
 * `recordWriteMany` stamps every row with the same `created_at`, so the store's default read order
 * (`created_at desc, id`) falls through to the id: ascending ids, handed out in source order, ARE
 * the source order.
 */
export function sourceOrderIds(count: number): string[] {
  return Array.from({ length: count }, () => crypto.randomUUID()).sort();
}

/** Makes the designed database: the table with every property, then its sample rows in one write. */
export async function createDesignedDatabase(design: DatabaseDesign, spaceId: string | null, activeOrg: string | null, userId: string | null): Promise<{ table: PickedSource; views: SpaceDbView[] }> {
  const client = await clientFor(spaceId, activeOrg, userId);
  const made = await declareTable(client, {
    name: design.name,
    slug: `${tokenFor(design.name)}_${Date.now().toString(36)}`,
    titleField: design.title_property,
    fields: design.properties.map((p, i) => fieldSpec(p, (i + 1) * 10)),
  });
  if (!made.ok) throw new Error(made.error.message || "The database could not be made.");
  const rows = design.rows.map((r) => rowData(design, r)).filter((r) => Object.keys(r).length);
  if (rows.length) {
    const wrote = await client.recordWriteMany({ table_id: made.data, rows: rows as never, ids: sourceOrderIds(rows.length) });
    if (!wrote.ok) throw new Error(`The sample rows could not be added: ${wrote.error.message}`);
  }
  return { table: { tableId: made.data, name: design.name }, views: blockViews(design) };
}

/** "Redesign with AI": adds the properties the design has and the table lacks (matched by name), each with
 *  its choices; existing properties and rows stay exactly as they are. Answers the design's views. */
export async function applyRedesign(design: DatabaseDesign, tableId: string, existingLabels: string[], client: RecordsClient): Promise<{ added: string[]; views: SpaceDbView[] }> {
  const have = new Set(existingLabels.map((l) => l.trim().toLowerCase()));
  const added: string[] = [];
  let sort = 1000;
  for (const p of design.properties) {
    if (have.has(p.name.trim().toLowerCase())) continue;
    const { declaration, ...spec } = fieldSpec({ ...p, key: `${p.key}_${Date.now().toString(36).slice(-4)}` }, (sort += 10));
    const res = await client.fieldDeclare({ table_id: tableId, spec: { ...spec, ...(declaration ?? {}) } as never });
    if (!res.ok) throw new Error(`${p.name} could not be added: ${res.error.message}`);
    added.push(p.name);
  }
  return { added, views: blockViews(design) };
}

/** An existing database as the `current_design` markdown the designer reads. */
export function designMarkdown(name: string, fields: Array<{ key: string; label: string; type?: string; parity_type?: string; options?: unknown }>, views: SpaceDbView[], rows: Array<Record<string, unknown>>): string {
  const lines = [`## ${name}`, "Properties:"];
  for (const f of fields) {
    const opts = Array.isArray(f.options) ? (f.options as unknown[]).map((o) => (typeof o === "string" ? o : str((o as { label?: string; value?: string }).label ?? (o as { value?: string }).value))).filter(Boolean) : [];
    lines.push(`- ${f.label} (${f.parity_type ?? f.type ?? "text"}${opts.length ? `: ${opts.join(", ")}` : ""})`);
  }
  lines.push(`Views: ${views.map((v) => `${v.name} (${v.layout})`).join(", ") || "Table"}`);
  if (rows.length) {
    lines.push("Rows:", `| ${fields.map((f) => f.label).join(" | ")} |`, `|${fields.map(() => "---").join("|")}|`);
    for (const r of rows.slice(0, 10)) lines.push(`| ${fields.map((f) => String(r[f.key] ?? "").replace(/\|/g, "/")).join(" | ")} |`);
  }
  return lines.join("\n");
}
