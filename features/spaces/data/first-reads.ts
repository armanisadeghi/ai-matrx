// features/spaces/data/first-reads.ts — round 36: the exact first questions a database block asks, in
// ONE place, so the server (page/space-page-seed.server.ts) asks them with the same arguments the
// browser's blocks send and its answers are found by the blocks' seed reads. Plain module: no React, no
// "use client" — the server route imports it.

import type { AggregateMeasure, RecordFilter } from "@ai-matrx/records";
import type { EntityColumn } from "@ai-matrx/records-ui";

import type { ChartSettings, SpaceDbView } from "./sources";

/** A chart view's settings when it has none of its own. */
export const DEFAULT_CHART: ChartSettings = { type: "donut", groupBy: null, op: "count", centerValue: true };

/** Groups a chart asks the store for (Notion: "Only showing 200 options"). */
export const GROUP_LIMIT = 200;

/** A built-in source's rows per read (the first page; each "Load more" asks the next). */
export const ENTITY_PAGE = 50;

/** The measure a chart's settings ask for. */
export function chartMeasure(settings: ChartSettings): AggregateMeasure {
  return settings.op === "count" || !settings.field ? { op: "count" } : { op: settings.op, key: settings.field };
}

/** A filter of "is any of" lists: the aggregate door cannot answer it, the chart counts read rows instead. */
export const hasListFilter = (filter: Record<string, unknown>) => Object.values(filter).some(Array.isArray);

/** A table chart's two aggregate questions (`record_aggregate` minus the table): the groups, then the whole. */
export function chartTileSpecs(settings: ChartSettings, filter: Record<string, unknown>) {
  const measure = chartMeasure(settings);
  const group = settings.groupBy ?? null;
  const narrowed = Object.keys(filter).length > 0 ? { filter: filter as RecordFilter } : {};
  return {
    grouped: { groupBy: group ? [group] : [], measures: [measure], limit: GROUP_LIMIT, ...narrowed },
    whole: { measures: [measure], ...narrowed },
  };
}

/** The view a block shows first. */
export function activeView(views: readonly SpaceDbView[] | undefined, activeViewId: string | undefined): SpaceDbView {
  const list = views?.length ? views : [{ id: "view-all", name: "All", layout: "grid" as const }];
  return list.find((v) => v.id === activeViewId) ?? list[0];
}

type EntitySort = { field: string; direction: "asc" | "desc" } | null;

/** `drillRows`'s arguments for a built-in source's page (a view's filter and sort, the viewer's search). */
export function entityRowsArgs(token: string, filters: Record<string, unknown>, sort: EntitySort, search: string, limit: number, offset?: number) {
  return {
    source: { kind: "entity" as const, token },
    ...(Object.keys(filters).length ? { where: filters } : {}),
    ...(sort ? { sort: { key: sort.field, direction: sort.direction } } : {}),
    ...(search ? { search } : {}),
    limit,
    ...(offset !== undefined ? { offset } : {}),
  };
}

/** The described columns a page shows (a lookup's own id column stands in for the lookup). */
export function entityShownColumns(apiColumns: readonly EntityColumn[], pageColumns: readonly unknown[] | undefined): EntityColumn[] {
  const shown = new Set((pageColumns ?? []).filter((c): c is string => typeof c === "string"));
  return apiColumns.filter((c) => c.api_name !== "id" && (shown.size === 0 || shown.has(c.api_name) || shown.has(c.lookup?.via ?? "")));
}

/** The column a board or chart groups by when its view names none: a choice the module names in words. */
export function entityDefaultGroup(columns: readonly EntityColumn[]): EntityColumn | undefined {
  return columns.find((c) => c.type === "choice") ?? columns.find((c) => c.lookup && c.lookup.replaces);
}

/** A built-in chart's group (`EntityChartBlock`'s `by`). */
export function entityChartBy(view: SpaceDbView, columns: readonly EntityColumn[]): string | undefined {
  return view.chart?.groupBy ?? view.groupField ?? entityDefaultGroup(columns)?.api_name ?? undefined;
}

type SeedAnswer = { door: string; args: Record<string, unknown>; data: unknown };

/** Arguments compared as data: key order never matters, an absent key equals an empty object. */
function same(a: unknown, b: unknown): boolean {
  const canon = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(canon(a ?? {})) === JSON.stringify(canon(b ?? {}));
}

/**
 * A built-in block's first describe and page from its block seed (the server asked them through the
 * same client calls, `entityRowsArgs`). Read synchronously by the block's first render. Null when absent.
 */
export function seededEntityFirst(answers: readonly SeedAnswer[] | null, token: string, filters: Record<string, unknown>, sort: EntitySort, search: string, limit: number): { def: unknown; page: unknown } | null {
  if (!answers) return null;
  const { source, limit: l, ...rest } = entityRowsArgs(token, filters, sort, search, limit);
  const question = { ...("where" in rest ? { where: rest.where } : {}), ...("sort" in rest ? { sort: rest.sort } : {}), ...("search" in rest ? { search: rest.search } : {}), limit: l };
  const def = answers.find((a) => a.door === "drill_describe" && same(a.args.p_source, source));
  const page = answers.find((a) => a.door === "drill_rows" && same(a.args.p_source, source) && same(a.args.p_question, question));
  return def && page ? { def: def.data, page: page.data } : null;
}

/**
 * A table chart's two aggregates from its block seed (the server asked `chartTileSpecs` through the
 * records client, whose `recordAggregate` fills `p_group_by` [], `p_filter` {} and `p_limit` 200). Raw
 * door rows: the caller lifts them as the client does (`liftWithheld`). Null when absent.
 */
export function seededChartTiles(answers: readonly SeedAnswer[] | null, tableId: string, settings: ChartSettings, filter: Record<string, unknown>): { grouped: unknown; whole: unknown } | null {
  if (!answers) return null;
  const { grouped, whole } = chartTileSpecs(settings, filter);
  const find = (spec: { groupBy?: string[]; measures: unknown; limit?: number; filter?: unknown }) =>
    answers.find(
      (a) =>
        a.door === "record_aggregate" &&
        a.args.p_table_id === tableId &&
        same(a.args.p_group_by, spec.groupBy ?? []) &&
        same(a.args.p_measures, spec.measures) &&
        same(a.args.p_filter, spec.filter ?? {}) &&
        a.args.p_limit === (spec.limit ?? GROUP_LIMIT),
    );
  const g = find(grouped);
  const w = find(whole);
  return g && w ? { grouped: g.data, whole: w.data } : null;
}
