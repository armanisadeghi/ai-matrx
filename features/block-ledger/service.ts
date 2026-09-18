// features/block-ledger/service.ts
//
// The entity-list service triple over `platform.acquisition_block`, read DIRECTLY
// through supabase-js the way every client read on this platform is (root CLAUDE.md:
// clients never route DB reads through the Python server). RLS is the `ledger`
// variant — org membership — so a person sees their organizations' blocks and
// nothing else, and this file never mentions an organization id.
//
// 🚨 `total` is the FILTERED total, from the same predicate the rows came from.
// `rows.length` is never a total, and the scope tab's number is the unfiltered one.

import { supabase } from "@/utils/supabase/client";
import type { EntityListService } from "@/lib/entity-list/config";
import type {
  EntityFacets,
  EntityListPage,
  EntityListQuery,
  EntityListSort,
  EntityScopeCounts,
} from "@/lib/entity-list/types";
import type { AcquisitionBlock } from "./types";

const TABLE = "acquisition_block";
const SCHEMA = "platform";

/** Columns the list reads. Everything the table has except the jsonb payloads
 *  the row detail opens, so a 200-row page never carries trails nobody looked at. */
const LIST_COLUMNS =
  "id,input_ref,input_label,source_type,engine,rung,error_class,error_sentence," +
  "unblock_note,lawful_route,first_seen_at,last_seen_at,occurrence_count,status," +
  "retry_count,last_retry_at,handoff_id,library_id,organization_id,created_at," +
  "updated_at,deleted_at";

/** The sortable columns, by the id the column registry uses. A stored preference
 *  naming anything else falls back rather than erroring the page. */
const SORTABLE: Record<string, string> = {
  last_seen_at: "last_seen_at",
  first_seen_at: "first_seen_at",
  occurrence_count: "occurrence_count",
  input_ref: "input_ref",
  source_type: "source_type",
  engine: "engine",
  error_class: "error_class",
  status: "status",
};

type Query = ReturnType<typeof baseQuery>;

function baseQuery(select: string, opts?: { count?: "exact"; head?: boolean }) {
  return supabase
    .schema(SCHEMA)
    .from(TABLE)
    .select(select, opts)
    .is("deleted_at", null);
}

function selectedValues(
  query: EntityListQuery,
  id: string,
): string[] | null {
  const value = query.filters[id];
  if (!value || value.kind !== "select" || value.values.length === 0) return null;
  return value.values;
}

function applyFilters(builder: Query, query: EntityListQuery): Query {
  let next = builder;
  for (const id of ["source_type", "engine", "rung", "status", "error_class"]) {
    const values = selectedValues(query, id);
    if (values) next = next.in(id, values) as Query;
  }
  const search = query.search.trim();
  if (search) {
    // The three things a person actually types: the address, its name, and a
    // word out of the error itself.
    const escaped = search.replace(/[%,()]/g, " ");
    next = next.or(
      `input_ref.ilike.%${escaped}%,input_label.ilike.%${escaped}%,` +
        `error_sentence.ilike.%${escaped}%`,
    ) as Query;
  }
  return next;
}

async function countBy(column: string): Promise<{ value: string; count: number }[]> {
  // One read, counted in the browser: the whole point of this register is that
  // it stays small enough to act on, and a per-facet RPC for a few hundred rows
  // would be a server round trip per section for no gain.
  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(TABLE)
    .select(column)
    .is("deleted_at", null)
    .limit(5000);
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as unknown as Record<string, string | null>[]) {
    const value = row[column];
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export const blockLedgerService: EntityListService<AcquisitionBlock> = {
  async fetchPage(
    query: EntityListQuery,
    sort: EntityListSort,
  ): Promise<EntityListPage<AcquisitionBlock>> {
    const column = SORTABLE[sort.sort] ?? "last_seen_at";
    const from = (query.page - 1) * sort.pageSize;
    const builder = applyFilters(
      baseQuery(LIST_COLUMNS, { count: "exact" }),
      query,
    )
      .order(column, { ascending: sort.direction === "asc" })
      .range(from, from + sort.pageSize - 1);

    const { data, error, count } = await builder;
    if (error) throw error;
    return {
      rows: (data ?? []) as unknown as AcquisitionBlock[],
      total: Number(count ?? 0),
    };
  },

  /**
   * ONE scope, and its count is every block this person can see.
   *
   * A block belongs to an organization, not to a person: the row is written by
   * the server on behalf of whoever hit the wall, and everyone in the org is
   * meant to see the same list. So "mine", "shared with me" and "public" would
   * be three tabs that can never differ, and the honest declaration is one.
   */
  async fetchCounts(): Promise<EntityScopeCounts> {
    const { count, error } = await supabase
      .schema(SCHEMA)
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null);
    if (error) throw error;
    return { byKind: { mine: Number(count ?? 0) }, narrow: {} };
  },

  async fetchFacets(): Promise<EntityFacets> {
    const [source_type, engine, rung, status, error_class] = await Promise.all([
      countBy("source_type"),
      countBy("engine"),
      countBy("rung"),
      countBy("status"),
      countBy("error_class"),
    ]);
    return { byKind: { source_type, engine, rung, status, error_class } };
  },
};
