"use client";

/**
 * useHubOrgCounts — the number beside each organization in the hub's organization filter.
 *
 * The count is THE LIST (as /agents/all's `agx_list_scope_counts` is): each organization's number is
 * what the list below returns when that organization is chosen — same words, same filters, same
 * lane — asked once per organization, all organizations at once, never narrowed by the filter that is
 * currently applied (you read "AI Matrx 12" while looking at "Acme", so the menu still tells you
 * where to go next). Never the header's active organization.
 *
 *   Transcripts view → ONE `trx_list_scope_counts` read (the list's own count, grouped by organization,
 *                      for the Organizations lane — the same words and filters as the list). One read, not
 *                      one per organization: `trx_list_scoped` counts the whole set each time, and a dozen
 *                      of those at once outrun the server's time budget (measured: HTTP 500s). Other lanes
 *                      (Mine / Shared / Public) and a text search carry no per-organization number.
 *   Every other view → the knowledge search with `organizations: [id]` and `limit: 0` (the server's
 *                      count-only pass over `platform.count_items`), summed the way the hub's own
 *                      total is (every section but Top hit and Segments).
 *
 * An organization whose count could not be read shows NO number (never a 0): the menu still works.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import type {
  KnowledgeQuery,
  KnowledgeSearchRunner,
} from "@/features/knowledge/api/knowledgeSearch";
import type { EntityScopeCounts } from "@/lib/entity-list/types";
import { EMPTY_SCOPE_COUNTS } from "@/lib/entity-list/types";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { readListRpc } from "@/lib/entity-list/readListRpc";

/** Sections the hub's own total leaves out (they repeat the items' rows). */
const NOT_IN_TOTAL = new Set(["top_hit", "segments"]);

/** Reads every organization's count at once. A missing id (or a failed read) is "no number", never 0. */
export type OrgCounter = (orgIds: string[]) => Promise<Map<string, number>>;

/** The knowledge search's count for each organization: the same query, `limit: 0`, summed like the hub's total. */
export function knowledgeOrgCounter(runner: KnowledgeSearchRunner, query: KnowledgeQuery): OrgCounter {
  const { organizations: _own, cursors: _cursors, ...rest } = query;
  const one = async (orgId: string) => {
    const sections = await runner({ ...rest, mode: "find", organizations: [orgId], limit: 0 });
    let total = 0;
    for (const s of sections) {
      if (NOT_IN_TOTAL.has(s.key)) continue;
      if (s.error || typeof s.count !== "number") throw new Error(s.error?.message ?? `${s.key} did not count`);
      total += s.count;
    }
    return total;
  };
  return async (orgIds) => {
    const settled = await Promise.allSettled(orgIds.map(one));
    const out = new Map<string, number>();
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") out.set(orgIds[i], r.value);
    });
    return out;
  };
}

/**
 * The transcripts list's count per organization: the Organizations lane of `trx_list_scope_counts`
 * (one read, grouped by organization) with the list's own words and filters. Only that lane has
 * per-organization rows, so another lane or a text search yields no numbers.
 */
export function transcriptOrgCounter(args: {
  scope: string;
  search: string;
  filters: Record<string, { values: string[] }>;
}): OrgCounter {
  return async () => {
    const out = new Map<string, number>();
    if (args.scope !== "orgs" || args.search) return out;
    const { data, error } = await readListRpc("trx_list_scope_counts", {
      p_search: undefined,
      p_deep: false,
      p_filters: args.filters,
    }, { order: ["scope", "narrow_id"] });
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as { scope: string; narrow_id: string | null; total: number | string }[]) {
      if (row.scope === "orgs" && row.narrow_id) out.set(row.narrow_id, Number(row.total ?? 0));
    }
    return out;
  };
}

export interface HubOrgCounts {
  counts: EntityScopeCounts;
  loading: boolean;
}

/**
 * @param enabled   false for views that are not a query (Trash, Favorites, Inbox…) and sample data
 * @param countKey  changes whenever the list's own query (words, filters, lane) changes — never with the org filter
 * @param counter   builds the per-organization count for the current query
 */
export function useHubOrgCounts(args: { enabled: boolean; countKey: string; counter: OrgCounter }): HubOrgCounts {
  const { organizations } = useUserOrganizations();
  const orgKey = organizations.map((o) => o.id).join(",");
  const [state, setState] = useState<{ key: string; counts: EntityScopeCounts } | null>(null);
  const key = `${args.countKey}|${orgKey}`;
  const active = args.enabled && organizations.length > 1;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void (async () => {
      let counted = new Map<string, number>();
      try {
        counted = await args.counter(organizations.map((o) => o.id));
      } catch {
        // No numbers: the menu still works, and the list itself says if IT failed.
      }
      if (cancelled) return;
      const rows = organizations.flatMap((o) =>
        counted.has(o.id) ? [{ id: o.id, label: o.name || "Unnamed organization", count: counted.get(o.id) as number }] : [],
      );
      setState({ key, counts: { byKind: {}, narrow: { all: rows } } });
    })();
    return () => {
      cancelled = true;
    };
    // `key` is the query + the membership list; the counter closure is rebuilt with both.
  }, [active, key]);

  if (!active) return { counts: EMPTY_SCOPE_COUNTS, loading: false };
  const current = state?.key === key ? state : null;
  return { counts: current?.counts ?? EMPTY_SCOPE_COUNTS, loading: current === null };
}
