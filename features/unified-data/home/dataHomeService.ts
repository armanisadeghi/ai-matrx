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

/** How many archived rows one store read asks for (one page ≈ 0.7 s for a many-org person). */
export const ARCHIVE_READ = 100;

/** The most one store read asks for (the door's own ceiling is 1000). */
export const ARCHIVE_READ_MAX = 500;

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
  /**
   * THE ARCHIVE AXIS (lane TABLE-ACTIONS item 10): the archive, read a page at a time from the
   * store only when the list's Archived filter asks (never on first paint), newest archived first.
   * `offset`/`limit` are the store's; `ended` says the archive has nothing after these rows.
   * Absent → the axis shows active rows only.
   */
  readArchived?: (page: { offset: number; limit: number }) => Promise<{ rows: DataHomeRow[]; ended: boolean }>;
  /**
   * The rows `load` resolved to, synchronously, once they are in hand (undefined before). With it
   * the service answers the shell's `peek` — every keystroke repaints in its own render.
   */
  loaded?: () => DataHomeRow[] | undefined;
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
    case "foundation":
      return row.foundation;
    default:
      return null;
  }
}

const FACET_COLUMNS = ["kind", "organization", "owner", "access", "records", "foundation"] as const;

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
  let held: DataHomeRow[] | undefined;
  const all = () => {
    if (!corpus) {
      corpus = opts.load().then(
        (rows) => {
          held = rows;
          return rows;
        },
        (error: unknown) => {
          corpus = null; // a failed read is retried on the next ask, never cached as empty
          throw error;
        },
      );
    }
    return corpus;
  };
  /** The rows in hand right now, or undefined (still loading) — the `peek` answers only then. */
  const inHand = () => held ?? opts.loaded?.();
  const now = () => (opts.now ? opts.now() : Date.now());

  type MatchOpts = { lane?: DataHomeScope | null; skip?: string; org?: boolean };

  /** Rows under everything but the lane (and one facet's own filter), with each one's relevance. */
  const matching = (rows: DataHomeRow[], query: EntityListQuery, o: MatchOpts = {}) => {
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

  /** The server's hits for this query's text, when it has answered (never asks). */
  const serverFor = (query: EntityListQuery, words: string, searching: boolean, titleOnly: boolean) =>
    searching && !titleOnly && words.length >= 2 && opts.server ? opts.server.lookup(words, query.orgId) : undefined;

  /**
   * The rows only the server found, under the same lane, organization, filters and tokens as the
   * instant hits, best first, each saying where it matched.
   */
  const serverOnly = (
    rows: DataHomeRow[],
    query: EntityListQuery,
    server: ServerMatches,
    shown: ReadonlySet<string>,
    o: MatchOpts = {},
  ): DataHomeRow[] => {
    const under = matching(rows, { ...query, search: tokensOnly(query.search) }, o);
    return under.out
      .filter((m) => server.has(m.row.id) && !shown.has(m.row.id))
      .sort((a, b) => (server.get(b.row.id)?.rank ?? 0) - (server.get(a.row.id)?.rank ?? 0))
      .map((m) => {
        const hit = server.get(m.row.id)!;
        return { ...m.row, matched: { in: hit.in, field: hit.field } };
      });
  };

  /** Every row the list holds for this query — instant hits and server-only hits — for counts and facets. */
  const everyMatch = (all: DataHomeRow[], query: EntityListQuery, o: MatchOpts = {}) => {
    const m = matching(all, query, o);
    const rows = m.out.map((x) => x.row);
    const server = serverFor(query, m.words, m.searching, m.titleOnly);
    if (!server || server.size === 0) return rows;
    return [...rows, ...serverOnly(all, query, server, new Set(rows.map((r) => r.id)), o)];
  };

  const pageOf = (all: DataHomeRow[], query: EntityListQuery, sort: EntityListSort) => {
      const { out, searching, words, titleOnly } = matching(all, query, { lane: laneOf(query) });
      const server = serverFor(query, words, searching, titleOnly);
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
        // LANE 10 FD: FOUNDATION TABLES FIRST — the business's day-one data, pinned under the
        // person's favourites by the same "pin to top" preference (Notion's pinned teamspaces).
        if (sort.favoritesFirst && x.row.foundation !== y.row.foundation) return x.row.foundation ? -1 : 1;
        return byColumn(x.row, y.row);
      });
      let rows = out.map((m) => m.row);
      if (server && server.size > 0) {
        // The instant hits stay put, in their order; what only the server found comes beneath them.
        rows = [...rows, ...serverOnly(all, query, server, new Set(rows.map((r) => r.id)), { lane: laneOf(query) })];
      }
      const start = Math.max(0, (query.page - 1) * sort.pageSize);
      return { rows: rows.slice(start, start + sort.pageSize), total: rows.length };
  };

  const countsOf = (all: DataHomeRow[], query: EntityListQuery): EntityScopeCounts => {
      // THE COUNT IS THE LIST: every lane under the same search, filters and organization.
      const out = everyMatch(all, query);
      const byKind: EntityScopeCounts["byKind"] = {};
      for (const lane of LANES) byKind[lane] = out.filter((row) => inDataHomeScope(row, lane)).length;
      // Each organization's count, for the organization filter: the All lane, every organization.
      const everyOrg = everyMatch(all, query, { lane: "all", org: false });
      const perOrg = new Map<string, { id: string; label: string; count: number }>();
      for (const row of everyOrg) {
        if (!row.organizationId) continue;
        const cur = perOrg.get(row.organizationId) ?? { id: row.organizationId, label: row.organizationName ?? "", count: 0 };
        cur.count += 1;
        perOrg.set(row.organizationId, cur);
      }
      return { byKind, narrow: { all: [...perOrg.values()].sort((a, b) => a.label.localeCompare(b.label)) } };
  };

  const facetsOf = (all: DataHomeRow[], query: EntityListQuery): EntityFacets => {
      const byKind: EntityFacets["byKind"] = {};
      for (const id of FACET_COLUMNS) {
        // A facet's own filter is skipped so its options stay choosable.
        const out = everyMatch(all, query, { lane: laneOf(query), skip: id });
        const counts = new Map<string, number>();
        for (const row of out) {
          const v = text(fieldValue(row, id, opts));
          const key = v === "" ? NONE_VALUE : v;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        byKind[id] = [...counts.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
      }
      return { byKind };
  };

  // THE PEEK ANSWERS ONLY WHAT THE ASYNC CALL WOULD: same rows, same functions. A question whose
  // server layer would be asked (text of 2+ letters with no server answer yet) still answers in
  // hand — the instant hits — and asks the server exactly as fetchPage does; its answer re-asks the
  // list (DataHomeList's serverVersion → serviceKey).
  const askServer = (query: EntityListQuery) => {
    const { text: words, tokens } = parseTokens(query.search);
    const titleOnly = tokens.titleOnly || (query.filters.title_only?.kind === "boolean" && query.filters.title_only.value);
    const searching = words.length > 0;
    if (!serverFor(query, words, searching, Boolean(titleOnly)) && searching && !titleOnly && words.length >= 2) {
      opts.server?.request(words, query.orgId);
    }
  };

  // ── THE ARCHIVE, PAGED LIKE THE STORE PAGES IT (TABLE-ACTIONS fix round, 2026-10-03) ──────────
  // The store answers the archive a page at a time and names no count, so this half of the list is
  // OPEN-ENDED (`EntityListPage.hasMore`): the first rows draw as soon as the store's first page
  // arrives, the next page is read only when the person pages on, and no count is shown — the lane
  // badges and facet options are absent here rather than a full read of every archived table. The
  // order is the store's (newest archived first); a search, a lane, a filter or the organization
  // filter keeps reading pages until this page is full or the archive ends.
  const archive: { rows: DataHomeRow[]; ended: boolean; reading: Promise<void> | null } = { rows: [], ended: false, reading: null };
  /** One store read: at least ARCHIVE_READ rows, or as many as this page still needs. */
  const readMoreArchive = (atLeast = ARCHIVE_READ) => {
    if (!opts.readArchived) {
      archive.ended = true;
      return Promise.resolve();
    }
    if (!archive.reading) {
      archive.reading = opts
        .readArchived({ offset: archive.rows.length, limit: Math.min(Math.max(ARCHIVE_READ, atLeast), ARCHIVE_READ_MAX) })
        .then((answer) => {
          archive.rows.push(...answer.rows);
          if (answer.ended || archive.rows.length >= DATA_HOME_ROW_CAP) archive.ended = true;
        })
        .finally(() => {
          archive.reading = null;
        });
    }
    return archive.reading;
  };
  const archiveMatches = (query: EntityListQuery) =>
    matching(archive.rows, query, { lane: laneOf(query) }).out.map((m) => m.row);
  /** The archived half's page, or undefined when it needs another store page first. */
  const archivePageInHand = (query: EntityListQuery, sort: EntityListSort, before: DataHomeRow[]) => {
    const want = query.page * sort.pageSize + 1 - before.length;
    const found = archiveMatches(query);
    if (found.length < want && !archive.ended) return undefined;
    const rows = [...before, ...found];
    const start = Math.max(0, (query.page - 1) * sort.pageSize);
    const shown = rows.slice(start, start + sort.pageSize);
    return { rows: shown, total: start + shown.length, hasMore: rows.length > start + sort.pageSize };
  };
  /** "Active + archived": the live rows as the list orders them, then the archive, open-ended. */
  const activeHalf = (rows: DataHomeRow[], query: EntityListQuery, sort: EntityListSort) =>
    pageOf(rows, { ...query, page: 1 }, { ...sort, pageSize: Number.MAX_SAFE_INTEGER }).rows;
  const openEndedPage = async (query: EntityListQuery, sort: EntityListSort) => {
    const before = query.archived === "all" ? activeHalf(await all(), query, sort) : [];
    for (;;) {
      const page = archivePageInHand(query, sort, before);
      if (page) return page;
      // As many as this page still needs, so a 100-row page is one read, not two.
      await readMoreArchive(query.page * sort.pageSize + 1 - before.length - archiveMatches(query).length);
    }
  };
  // No count is made here (see above); the organization filter lists its choices without numbers.
  const NO_COUNTS: EntityScopeCounts = { byKind: {}, narrow: {} };
  const NO_FACETS: EntityFacets = { byKind: {} };
  const openEnded = (query: EntityListQuery) => query.archived === "archived" || query.archived === "all";

  return {
    async fetchPage(query: EntityListQuery, sort: EntityListSort) {
      if (openEnded(query)) return openEndedPage(query, sort);
      const rows = await all();
      askServer(query);
      return pageOf(rows, query, sort);
    },
    async fetchCounts(query: EntityListQuery): Promise<EntityScopeCounts> {
      if (openEnded(query)) return NO_COUNTS;
      return countsOf(await all(), query);
    },
    async fetchFacets(query: EntityListQuery): Promise<EntityFacets> {
      if (openEnded(query)) return NO_FACETS;
      return facetsOf(await all(), query);
    },
    peek: {
      page(query, sort) {
        if (openEnded(query)) {
          if (query.archived === "archived") return archivePageInHand(query, sort, []);
          const rows = inHand();
          return rows ? archivePageInHand(query, sort, activeHalf(rows, query, sort)) : undefined;
        }
        const rows = inHand();
        if (!rows) return undefined;
        askServer(query);
        return pageOf(rows, query, sort);
      },
      counts(query) {
        if (openEnded(query)) return NO_COUNTS;
        const rows = inHand();
        return rows ? countsOf(rows, query) : undefined;
      },
      facets(query) {
        if (openEnded(query)) return NO_FACETS;
        const rows = inHand();
        return rows ? facetsOf(rows, query) : undefined;
      },
    },
  };
}
