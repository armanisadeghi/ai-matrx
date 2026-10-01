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

/** One server search's answer: row id → where and how well it matched (best first). */
export type ServerMatches = Map<string, { rank: number; in: "name" | "description" | "field" | "id"; field: string | null }>;

export interface DataHomeServiceOptions {
  load: () => Promise<DataHomeRow[]>;
  /**
   * THE SERVER LAYER (DATA-HOME-3B's `custom.data_home(p_search)`): what the row does not carry —
   * Field labels, descriptions. `lookup` answers from what has already come back (undefined = not
   * yet); `request` asks for it (debounced, and the page re-asks the list when it lands). The
   * instant hits never wait for it.
   */
  server?: {
    lookup: (search: string, organizationId: string | null) => ServerMatches | undefined;
    request: (search: string, organizationId: string | null) => void;
  };
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

/** The search with its free text removed and its tokens kept (the server hits obey the tokens). */
function tokensOnly(search: string): string {
  return search
    .split(/\s+/)
    .filter((w) => /^(kind|org|owner|is|updated|in):/i.test(w))
    .join(" ");
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
    return { out, searching: words.length > 0, words, titleOnly: Boolean(titleOnly) };
  };

  return {
    async fetchPage(query: EntityListQuery, sort: EntityListSort) {
      const { out, searching, words, titleOnly } = await matching(query, { lane: laneOf(query) });
      const serverText = searching && !titleOnly && words.length >= 2 ? words : null;
      const server = serverText && opts.server ? opts.server.lookup(serverText, query.orgId) : undefined;
      if (serverText && opts.server && !server) opts.server.request(serverText, query.orgId);
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
      let rows = out.map((m) => m.row);
      if (server && server.size > 0) {
        // The instant hits stay put, in their order; what only the server found comes beneath them,
        // best first — under the same lane, organization, filters and tokens as the instant hits.
        const shown = new Set(rows.map((r) => r.id));
        const under = await matching({ ...query, search: tokensOnly(query.search) }, { lane: laneOf(query) });
        const extra = under.out
          .filter((m) => server.has(m.row.id) && !shown.has(m.row.id))
          .sort((a, b) => (server.get(b.row.id)?.rank ?? 0) - (server.get(a.row.id)?.rank ?? 0))
          .map((m) => {
            const hit = server.get(m.row.id)!;
            return { ...m.row, matched: { in: hit.in, field: hit.field } };
          });
        rows = [...rows, ...extra];
      }
      const start = Math.max(0, (query.page - 1) * sort.pageSize);
      return { rows: rows.slice(start, start + sort.pageSize), total: rows.length };
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
