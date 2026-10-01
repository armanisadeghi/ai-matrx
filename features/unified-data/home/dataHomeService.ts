// features/unified-data/home/dataHomeService.ts — LANE DATA-HOME-3A
//
// THE DATA HOME'S LIST SERVICE: the shell's service triple (page, counts, facets) over the rows
// the home's one door answered, held in hand. Not `createMemoryListService` as-is, because the home
// needs what that service has no axis for: the seven lanes (decided per row from the door's lane
// facts, `inDataHomeScope`), relevance ranking while searching, star-first, and tokens. Everything
// still runs over the WHOLE loaded set, never a page (the shell's column policy).
//
// BOUND, STATED: the corpus is every row the person may open (444 rows in 29 organizations for the
// admin seat, 2026-10-01). Past DATA_HOME_ROW_CAP the newest rows are kept and the page says so —
// never a silent cut (see `capped`).

import type { EntityListService } from "@/lib/entity-list/config";
import {
  NONE_VALUE,
  type EntityFacets,
  type EntityFilters,
  type EntityListQuery,
  type EntityListSort,
  type EntityScopeCounts,
} from "@/lib/entity-list/types";
import { inDataHomeScope, isDataHomeScope, type DataHomeScope } from "@/features/unified-data/hub/dataHomeScope";
import type { DataHomeRow } from "./dataHomeRows";
import { matchesTokens, parseTokens, scoreRow, UPDATED_BUCKET_MS } from "./dataHomeSearch";

/** The most rows the home holds in hand (a stated bound, not a silent one). */
export const DATA_HOME_ROW_CAP = 5000;

export const LANES: readonly DataHomeScope[] = ["all", "mine", "team", "orgs", "shared", "public", "system"];

export interface DataHomeServiceOptions {
  load: () => Promise<DataHomeRow[]>;
  isStarred: (row: DataHomeRow) => boolean;
  ownerLabel: (row: DataHomeRow) => string | null;
  now?: () => number;
}

/** The filterable value of a column, keyed by COLUMN ID (the filter bag's and the sort's ids). */
export function fieldValue(
  row: DataHomeRow,
  id: string,
  opts: Pick<DataHomeServiceOptions, "isStarred" | "ownerLabel">,
): string | number | boolean | null {
  switch (id) {
    case "name":
      return row.name;
    case "kind":
      return row.kind;
    case "organization":
      return row.organizationId;
    case "records":
      return row.records;
    case "updated":
      return row.updatedAt;
    case "owner":
      return opts.ownerLabel(row);
    case "access":
      return row.access;
    case "changed_by":
      return row.changedBy;
    case "details":
      return row.details;
    case "link":
      return row.publicLabel;
    case "favorite":
      return opts.isStarred(row);
    default:
      return null;
  }
}

const FACET_COLUMNS = ["kind", "organization", "owner", "access", "records"] as const;

function text(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

function passesFilters(
  row: DataHomeRow,
  filters: EntityFilters,
  opts: DataHomeServiceOptions,
  now: number,
  skip?: string,
): boolean {
  for (const [id, filter] of Object.entries(filters)) {
    if (id === skip || id === "title_only") continue;
    if (id === "updated" && filter.kind === "select") {
      if (filter.values.length === 0) continue;
      const at = row.updatedAt ? Date.parse(row.updatedAt) : Number.NaN;
      const ok = filter.values.some((bucket) => {
        if (bucket === NONE_VALUE) return !Number.isFinite(at);
        const span = UPDATED_BUCKET_MS[bucket];
        return span !== undefined && Number.isFinite(at) && now - at <= span;
      });
      if (!ok) return false;
      continue;
    }
    const raw = fieldValue(row, id, opts);
    if (filter.kind === "select") {
      if (filter.values.length === 0) continue;
      const key = text(raw) === "" ? NONE_VALUE : text(raw);
      if (!filter.values.includes(key)) return false;
    } else if (filter.kind === "text") {
      if (!text(raw).toLowerCase().includes(filter.value.toLowerCase())) return false;
    } else if (filter.kind === "boolean") {
      if (Boolean(raw) !== filter.value) return false;
    }
  }
  return true;
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return text(a).localeCompare(text(b), undefined, { numeric: true, sensitivity: "base" });
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

export function laneOf(query: EntityListQuery): DataHomeScope {
  return isDataHomeScope(query.scope.kind) ? query.scope.kind : "all";
}

export function createDataHomeService(opts: DataHomeServiceOptions): EntityListService<DataHomeRow> {
  let corpus: Promise<DataHomeRow[]> | null = null;
  const all = () => {
    if (!corpus) {
      corpus = opts.load().catch((error: unknown) => {
        corpus = null; // a failed read is retried on the next ask, never cached as empty
        throw error;
      });
    }
    return corpus;
  };
  const now = () => (opts.now ? opts.now() : Date.now());

  /** Rows under everything but the lane (and one facet's own filter), with each one's relevance. */
  const matching = async (query: EntityListQuery, o: { lane?: DataHomeScope | null; skip?: string; org?: boolean } = {}) => {
    const rows = await all();
    const { text: words, tokens } = parseTokens(query.search);
    const titleOnly = tokens.titleOnly || query.filters.title_only?.kind === "boolean" && query.filters.title_only.value;
    const t = now();
    const out: Array<{ row: DataHomeRow; score: number }> = [];
    for (const row of rows) {
      if (o.lane && !inDataHomeScope(row, o.lane)) continue;
      if (o.org !== false && query.orgId && row.organizationId !== query.orgId) continue;
      if (!passesFilters(row, query.filters, opts, t, o.skip)) continue;
      if (!matchesTokens(row, tokens, opts.isStarred(row), opts.ownerLabel, t)) continue;
      const score = scoreRow(row, words, { titleOnly: Boolean(titleOnly), ownerLabel: opts.ownerLabel });
      if (score === null) continue;
      out.push({ row, score });
    }
    return { out, searching: words.length > 0 };
  };

  return {
    async fetchPage(query: EntityListQuery, sort: EntityListSort) {
      const { out, searching } = await matching(query, { lane: laneOf(query) });
      const sign = sort.direction === "desc" ? -1 : 1;
      const sortId = sort.sort === "favorite" ? "updated" : sort.sort;
      const byColumn = (a: DataHomeRow, b: DataHomeRow) => {
        const av = sortId === "updated" ? (a.updatedAt ? Date.parse(a.updatedAt) : null) : fieldValue(a, sortId, opts);
        const bv = sortId === "updated" ? (b.updatedAt ? Date.parse(b.updatedAt) : null) : fieldValue(b, sortId, opts);
        if (isEmpty(av) && isEmpty(bv)) return a.name.localeCompare(b.name);
        if (isEmpty(av)) return 1; // empty values sink in both directions
        if (isEmpty(bv)) return -1;
        return sign * compareValues(av, bv) || a.name.localeCompare(b.name);
      };
      out.sort((x, y) => {
        if (sort.favoritesFirst) {
          const fx = opts.isStarred(x.row) ? 1 : 0;
          const fy = opts.isStarred(y.row) ? 1 : 0;
          if (fx !== fy) return fy - fx;
        }
        // RELEVANCE OVERRIDES THE SORT WHILE SEARCHING (the shell's ratified rule); ties go to the
        // person's own, then the most recent change.
        if (searching) {
          if (y.score !== x.score) return y.score - x.score;
          if (x.row.mine !== y.row.mine) return x.row.mine ? -1 : 1;
          const ax = x.row.updatedAt ? Date.parse(x.row.updatedAt) : 0;
          const ay = y.row.updatedAt ? Date.parse(y.row.updatedAt) : 0;
          return ay - ax;
        }
        return byColumn(x.row, y.row);
      });
      const start = Math.max(0, (query.page - 1) * sort.pageSize);
      return { rows: out.slice(start, start + sort.pageSize).map((m) => m.row), total: out.length };
    },

    async fetchCounts(query: EntityListQuery): Promise<EntityScopeCounts> {
      // THE COUNT IS THE LIST: every lane under the same search, filters and organization.
      const { out } = await matching(query);
      const byKind: EntityScopeCounts["byKind"] = {};
      for (const lane of LANES) byKind[lane] = out.filter((m) => inDataHomeScope(m.row, lane)).length;
      // Each organization's count, for the organization filter: the All lane, every organization.
      const { out: everyOrg } = await matching(query, { lane: "all", org: false });
      const perOrg = new Map<string, { id: string; label: string; count: number }>();
      for (const { row } of everyOrg) {
        if (!row.organizationId) continue;
        const cur = perOrg.get(row.organizationId) ?? { id: row.organizationId, label: row.organizationName ?? "", count: 0 };
        cur.count += 1;
        perOrg.set(row.organizationId, cur);
      }
      return { byKind, narrow: { all: [...perOrg.values()].sort((a, b) => a.label.localeCompare(b.label)) } };
    },

    async fetchFacets(query: EntityListQuery): Promise<EntityFacets> {
      const byKind: EntityFacets["byKind"] = {};
      for (const id of FACET_COLUMNS) {
        // A facet's own filter is skipped so its options stay choosable.
        const { out } = await matching(query, { lane: laneOf(query), skip: id });
        const counts = new Map<string, number>();
        for (const { row } of out) {
          const v = text(fieldValue(row, id, opts));
          const key = v === "" ? NONE_VALUE : v;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        byKind[id] = [...counts.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
      }
      return { byKind };
    },
  };
}
