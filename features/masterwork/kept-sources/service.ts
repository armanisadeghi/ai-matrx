"use client";

// features/masterwork/kept-sources/service.ts
//
// Reading the raw material one Rulebook kept.
//
// Direct supabase-js over `platform.masterwork_source`, per the architecture
// rule: a plain DB read never takes a Python hop and never goes through a
// Next.js route. RLS is the authorization layer and it is keyed on the
// RULEBOOK — `std_select` resolves `rulebook_id` through
// `iam.accessible_entity_ids('rulebook', 'viewer')` — so anyone who can read
// the Rulebook can read the words it was built from, and nobody else.
//
// 🚨 THE ROW IS THE AUTHORITY, NOT THE EDGE. A `platform.associations` edge
// with role `kept_source` also exists, and it would have been the familiar way
// to ask this question. It is deliberately NOT how this reads: the edge is
// provenance about the row, and a list built from edges would silently drop a
// source whose edge write failed after the row landed. Query the table by
// `rulebook_id`.
//
// 🚨 NO `range()` CAP GAMES ON THE COUNT. The list pages through PostgREST
// with an exact count, so `total` is the server's number over the whole
// filtered set — never `rows.length`, which is one page.

import { supabase } from "@/utils/supabase/client";
import type { EntityListService } from "@/lib/entity-list/config";
import type {
  EntityFacets,
  EntityListPage,
  EntityListQuery,
  EntityListSort,
  EntityScopeCounts,
} from "@/lib/entity-list/types";
import type { Database } from "@/types/database.types";
import { countRulesForSource } from "../sourceSections";
import type { RulebookRule } from "../types";
import { toKeptSource, type KeptSource, type KeptSourceRow } from "./types";

type Row = Database["platform"]["Tables"]["masterwork_source"]["Row"];

/**
 * The list does NOT select `content` or `turns`.
 *
 * A kept source is the whole of somebody's book or a 90-minute interview; a
 * page of twenty-five of them would pull megabytes of prose to render five
 * numbers. The reader selects the body for exactly one row. (Word and turn
 * counts are stored columns precisely so the list never has to.)
 */
const LIST_COLUMNS =
  "id,rulebook_id,source_key,approach_key,run_id,label,medium,transcript_id,file_id,url,captured_at,word_count,turn_count,speaker_count,truncated,organization_id";

const READER_COLUMNS = `${LIST_COLUMNS},content,turns`;

const SORTABLE = new Set([
  "captured_at",
  "word_count",
  "turn_count",
  "speaker_count",
  "label",
  "approach_key",
]);

/** A list row with no body — `content`/`turns` are the reader's business. */
function listRow(row: Omit<Row, "content" | "turns">): KeptSource {
  return toKeptSource({ ...row, content: null, turns: [] } as Row);
}

/**
 * Every kept source for one Rulebook, as plain rows.
 *
 * Used by the surfaces that need the SET rather than a page of it — the rule
 * provenance line asks "does this rule's source_key have a kept row?" and must
 * not answer "no" from a truncated read. The population is per-Rulebook and
 * small (one row per captured source), so a single read is honest here; if a
 * Rulebook ever grows past a PostgREST page this must move to `readAllRows`.
 */
export async function listKeptSourceKeys(
  rulebookId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .schema("platform")
    .from("masterwork_source")
    .select("source_key")
    .eq("rulebook_id", rulebookId)
    .is("deleted_at", null);
  if (error) throw new Error(`${error.message} (${error.code})`);
  return new Set((data ?? []).map((r) => r.source_key));
}

/** One kept source, by its `source_key`, with its body. `null` = no such row. */
export async function getKeptSource(
  rulebookId: string,
  sourceKey: string,
): Promise<KeptSource | null> {
  const { data, error } = await supabase
    .schema("platform")
    .from("masterwork_source")
    .select(READER_COLUMNS)
    .eq("rulebook_id", rulebookId)
    .eq("source_key", sourceKey)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`${error.message} (${error.code})`);
  return data ? toKeptSource(data as Row) : null;
}

/**
 * Structural query surface shared by the page and facet builders. Interface
 * METHODS check bivariantly, so the typed PostgrestFilterBuilder satisfies
 * this without erasing to `any` (same approach as `browse/service.ts`).
 */
interface KeptSourceFilterable {
  eq(column: string, value: string): this;
  in(column: string, values: string[]): this;
  or(filters: string): this;
  gte(column: string, value: string): this;
  is(column: string, value: null): this;
}

/** The Captured column's relative buckets, in the same words the header offers. */
const DATE_BUCKET_MS: Record<string, number> = {
  "1h": 3600_000,
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  "90d": 90 * 86_400_000,
  "1y": 365 * 86_400_000,
};

function applyFilters<Q extends KeptSourceFilterable>(
  q: Q,
  query: EntityListQuery,
): Q {
  if (query.search.trim()) {
    const s = query.search.trim().replaceAll("%", "\\%");
    // Label and URL only. The BODY is deliberately not searched here: a
    // whole-corpus `ilike` over kept prose is the full scan `deep` exists to
    // gate, and this surface declares no deep search, so it must not pretend
    // to one.
    q = q.or(`label.ilike.%${s}%,url.ilike.%${s}%`);
  }
  for (const [id, f] of Object.entries(query.filters)) {
    if (f.kind === "select" && f.values.length > 0) {
      if (id === "lane_label") q = q.in("approach_key", f.values);
      else if (id === "medium") q = q.in("medium", f.values);
      else if (id === "captured_at") {
        // Relative buckets; the widest selection wins, so a multi-select that
        // slipped through still narrows to something a person asked for.
        const widest = Math.max(...f.values.map((v) => DATE_BUCKET_MS[v] ?? 0));
        if (widest > 0) {
          q = q.gte("captured_at", new Date(Date.now() - widest).toISOString());
        }
      }
    }
  }
  return q;
}

/**
 * The entity-list service triple for ONE Rulebook's kept sources.
 *
 * Built per Rulebook, so the config that carries it declares a `serviceKey` —
 * the shell must re-ask when the Rulebook (or the rules it counts against)
 * changes rather than keep the answer it got for the previous one.
 *
 * `rules` is passed in rather than re-read because the RULE COUNT column is a
 * client-side join against the Rulebook the page already loaded: `rulebook.rules`
 * is a jsonb array on the Rulebook row, not a table, so there is nothing to
 * count in SQL. Sorting by rule count is therefore not offered — it would sort
 * one page rather than the set, which is a lie a column header cannot tell.
 */
export function createKeptSourceService(options: {
  rulebookId: string;
  rules: RulebookRule[];
  laneLabels: Map<string, string>;
  /** False while the Approach registry is still loading or failed to load. */
  lanesResolved: boolean;
}): EntityListService<KeptSourceRow> {
  const { rulebookId, rules, laneLabels, lanesResolved } = options;

  const decorate = (source: KeptSource): KeptSourceRow => {
    const label = laneLabels.get(source.approach_key);
    return {
      ...source,
      // NEVER the raw key in front of a person when we have the label. When we
      // do NOT have it, the key is shown WITH a flag so the cell can say the
      // lane name could not be read, instead of printing `oracle_tap` as if
      // that were English.
      lane_label: label ?? source.approach_key,
      lane_unresolved: !label && lanesResolved ? true : !lanesResolved,
      rule_count: countRulesForSource(rules, source.source_key),
    };
  };

  return {
    async fetchPage(
      query: EntityListQuery,
      sort: EntityListSort,
    ): Promise<EntityListPage<KeptSourceRow>> {
      let q = supabase
        .schema("platform")
        .from("masterwork_source")
        .select(LIST_COLUMNS, { count: "exact" })
        .eq("rulebook_id", rulebookId)
        .is("deleted_at", null);
      q = applyFilters(q, query);
      const col = SORTABLE.has(sort.sort) ? sort.sort : "captured_at";
      const from = (query.page - 1) * sort.pageSize;
      const { data, error, count } = await q
        .order(col, { ascending: sort.direction === "asc" })
        .order("id", { ascending: true })
        .range(from, from + sort.pageSize - 1);
      if (error) throw new Error(`${error.message} (${error.code})`);
      return {
        rows: (data ?? []).map((row) =>
          decorate(listRow(row as Omit<Row, "content" | "turns">)),
        ),
        total: count ?? 0,
      };
    },

    // No scope tabs: the Rulebook IS the scope (see ./listConfig.tsx). An
    // empty counts payload is the honest answer, not a zero.
    async fetchCounts(): Promise<EntityScopeCounts> {
      return { byKind: {}, narrow: {} };
    },

    async fetchFacets(): Promise<EntityFacets> {
      // The lane and medium chips are built from the rows' own distinct
      // values, read over the whole Rulebook rather than the current page — a
      // facet that only knew about the loaded page would offer a narrowing
      // that hides rows it never saw.
      const { data, error } = await supabase
        .schema("platform")
        .from("masterwork_source")
        .select("approach_key,medium")
        .eq("rulebook_id", rulebookId)
        .is("deleted_at", null);
      if (error) throw new Error(`${error.message} (${error.code})`);
      const lane = new Map<string, number>();
      const medium = new Map<string, number>();
      for (const row of data ?? []) {
        lane.set(row.approach_key, (lane.get(row.approach_key) ?? 0) + 1);
        medium.set(row.medium, (medium.get(row.medium) ?? 0) + 1);
      }
      const toOptions = (counts: Map<string, number>) =>
        [...counts.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count);
      return {
        byKind: {
          lane_label: toOptions(lane),
          medium: toOptions(medium),
        },
      };
    },
  };
}
