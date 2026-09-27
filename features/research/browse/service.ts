// features/research/browse/service.ts
//
// The entity-list service triple over `research.rs_topic`, read DIRECTLY through
// supabase-js (clients never route DB reads through a server). RLS decides what a
// person may read; THIS file declares what the list SHOWS (the view law):
//   - mine → topics the person created;
//   - orgs → every topic their organizations hold (RLS-visible), or one org when
//            the tab is narrowed.
//
// The project a topic belongs to is an association edge, so the project filter
// and the project column are resolved through the association service — never a
// topic column. The corpus is small (a person's research topics), so the scope
// counts and facets are counted in the browser from one light read each, the
// way the block ledger does, instead of three bespoke RPCs.
//
// 🚨 `total` is the FILTERED total from the same predicate the rows came from.

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { workspaceDb } from "@/utils/supabase/workspaceDb";
import type { EntityListService } from "@/lib/entity-list/config";
import {
  NONE_VALUE,
  type EntityFacets,
  type EntityListPage,
  type EntityListQuery,
  type EntityListSort,
  type EntityScopeCounts,
} from "@/lib/entity-list/types";
import { associationsService } from "@/features/scopes/service/associationsService";
import type { ResearchTopicListRow } from "./types";

const LIST_COLUMNS =
  "id,name,description,status,autonomy_level,organization_id,created_by,created_at,updated_at,template_id";

/** Sortable column ids → DB columns. Anything else falls back to newest first. */
const SORTABLE: Record<string, string> = {
  name: "name",
  status: "status",
  autonomy_level: "autonomy_level",
  created_at: "created_at",
  updated_at: "updated_at",
};

/** Largest corpus the in-browser counts read; a person's topics are far below it. */
const LIGHT_READ_LIMIT = 5000;

type TopicBase = Omit<ResearchTopicListRow, "project_id" | "project_name">;

function baseQuery(select: string, opts?: { count?: "exact"; head?: boolean }) {
  return supabase
    .schema("research")
    .from("rs_topic")
    .select(select, opts)
    .is("deleted_at", null);
}

type Query = ReturnType<typeof baseQuery>;

function applyScope(builder: Query, query: EntityListQuery): Query {
  const scope = query.scope;
  if (scope.kind === "mine") return builder.eq("created_by", requireUserId()) as Query;
  if (scope.kind === "orgs" && scope.organizationId)
    return builder.eq("organization_id", scope.organizationId) as Query;
  // Blended "orgs": every topic the person's organizations hold (RLS-visible).
  return builder;
}

function applySearch(builder: Query, query: EntityListQuery): Query {
  const search = query.search.trim();
  if (!search) return builder;
  const escaped = search.replace(/[%,()]/g, " ");
  return builder.or(`name.ilike.%${escaped}%,description.ilike.%${escaped}%`) as Query;
}

function selectValues(query: EntityListQuery, id: string): string[] | null {
  const value = query.filters[id];
  if (!value || value.kind !== "select" || value.values.length === 0) return null;
  return value.values;
}

/** topic id → project id, from the canonical association edges. */
async function projectLinksFor(topicIds: string[]): Promise<Record<string, string>> {
  if (topicIds.length === 0) return {};
  const res = await associationsService.listForSources("research_topic", topicIds, "project");
  if (!res.ok) throw new Error(res.error.message);
  const out: Record<string, string> = {};
  for (const edge of res.data.edges) {
    if (!(edge.sourceId in out)) out[edge.sourceId] = edge.targetId;
  }
  return out;
}

/** Topic ids linked to any of the given projects. */
async function topicIdsForProjects(projectIds: string[]): Promise<string[]> {
  if (projectIds.length === 0) return [];
  const res = await associationsService.listForTargets("project", projectIds);
  if (!res.ok) throw new Error(res.error.message);
  return Array.from(
    new Set(
      res.data.edges
        .filter((edge) => edge.sourceType === "research_topic")
        .map((edge) => edge.sourceId),
    ),
  );
}

/**
 * Project names this service has read, by id. The facet chips and column
 * headers format a project VALUE (its id) synchronously, so the service fills
 * this before it returns the facets that name those ids.
 */
const PROJECT_NAME_CACHE = new Map<string, string>();

export function projectLabel(projectId: string): string {
  return PROJECT_NAME_CACHE.get(projectId) ?? "Unnamed project";
}

async function projectNames(projectIds: string[]): Promise<Record<string, string>> {
  if (projectIds.length === 0) return {};
  const { data, error } = await workspaceDb(supabase)
    .from("projects")
    .select("id,name")
    .in("id", projectIds);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    out[row.id] = row.name;
    PROJECT_NAME_CACHE.set(row.id, row.name);
  }
  return out;
}

/**
 * The project filter as the topic ids it allows, or `null` when no project
 * filter is set. Returns ids rather than a query builder: a PostgREST builder
 * is thenable, so an async function returning one would resolve it.
 */
async function projectFilterIds(
  query: EntityListQuery,
  scopedIds: () => Promise<string[]>,
): Promise<string[] | null> {
  const values = selectValues(query, "project");
  if (!values) return null;
  const wantsNone = values.includes(NONE_VALUE);
  const projectIds = values.filter((v) => v !== NONE_VALUE);
  const allowed = new Set(await topicIdsForProjects(projectIds));
  if (wantsNone) {
    // "No project" = topics in scope with no project edge at all.
    const ids = await scopedIds();
    const links = await projectLinksFor(ids);
    for (const id of ids) if (!links[id]) allowed.add(id);
  }
  return [...allowed];
}

const BUCKET_MS: Record<string, number> = {
  "1h": 3_600_000,
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  "90d": 90 * 86_400_000,
  "1y": 365 * 86_400_000,
};

/** Every column filter the list offers, applied to the row query. */
function applyColumnFilters(builder: Query, query: EntityListQuery): Query {
  let next = builder;
  for (const id of ["status", "autonomy_level"]) {
    const values = selectValues(query, id);
    if (values) next = next.in(id, values) as Query;
  }
  const name = query.filters.name;
  if (name?.kind === "text" && name.value.trim()) {
    next = next.ilike("name", `%${name.value.trim().replace(/[%,()]/g, " ")}%`) as Query;
  }
  for (const id of ["updated_at", "created_at"]) {
    // Several ticked buckets mean "within the widest of them".
    const widest = Math.max(
      0,
      ...(selectValues(query, id) ?? []).map((b) => BUCKET_MS[b] ?? 0),
    );
    if (widest > 0) next = next.gte(id, new Date(Date.now() - widest).toISOString()) as Query;
  }
  return next;
}

async function lightRows(
  query: EntityListQuery,
  select = "id,status,autonomy_level,organization_id,created_by",
): Promise<Record<string, string | null>[]> {
  const builder = applySearch(applyScope(baseQuery(select), query), query).limit(LIGHT_READ_LIMIT);
  const { data, error } = await builder;
  if (error) throw error;
  return (data ?? []) as unknown as Record<string, string | null>[];
}

function tally(values: (string | null | undefined)[]): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v ?? NONE_VALUE;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export const researchTopicListService: EntityListService<ResearchTopicListRow> = {
  async fetchPage(
    query: EntityListQuery,
    sort: EntityListSort,
  ): Promise<EntityListPage<ResearchTopicListRow>> {
    const column = SORTABLE[sort.sort] ?? "updated_at";
    const from = (query.page - 1) * sort.pageSize;
    let builder = applySearch(
      applyScope(baseQuery(LIST_COLUMNS, { count: "exact" }), query),
      query,
    );
    builder = applyColumnFilters(builder, query);
    const projectIds = await projectFilterIds(query, async () =>
      (await lightRows(query, "id")).map((r) => r.id as string),
    );
    if (projectIds) {
      // PostgREST has no "false" literal; an impossible id keeps an empty match honest.
      builder = builder.in(
        "id",
        projectIds.length ? projectIds : ["00000000-0000-0000-0000-000000000000"],
      ) as Query;
    }
    const { data, error, count } = await builder
      .order(column, { ascending: sort.direction === "asc", nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, from + sort.pageSize - 1);
    if (error) throw error;

    const rows = (data ?? []) as unknown as TopicBase[];
    const links = await projectLinksFor(rows.map((r) => r.id));
    const names = await projectNames([...new Set(Object.values(links))]);
    return {
      rows: rows.map((row) => {
        const projectId = links[row.id] ?? null;
        return {
          ...row,
          project_id: projectId,
          project_name: projectId ? (names[projectId] ?? null) : null,
        };
      }),
      total: Number(count ?? 0),
    };
  },

  async fetchCounts(query: EntityListQuery): Promise<EntityScopeCounts> {
    const userId = requireUserId();
    const all = await lightRows({ ...query, scope: { kind: "orgs", organizationId: null } });
    const byOrg = new Map<string, number>();
    for (const row of all) {
      const org = row.organization_id;
      if (org) byOrg.set(org, (byOrg.get(org) ?? 0) + 1);
    }
    const orgIds = [...byOrg.keys()];
    const labels: Record<string, string> = {};
    if (orgIds.length > 0) {
      const { data, error } = await supabase
        .schema("iam")
        .from("organizations")
        .select("id,name")
        .in("id", orgIds);
      if (error) throw error;
      for (const org of data ?? []) labels[org.id] = org.name;
    }
    return {
      byKind: {
        mine: all.filter((r) => r.created_by === userId).length,
        orgs: all.length,
      },
      narrow: {
        orgs: orgIds
          .map((id) => ({
            id,
            label: labels[id] ?? "Organization",
            count: byOrg.get(id) ?? 0,
          }))
          .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
      },
    };
  },

  async fetchFacets(query: EntityListQuery): Promise<EntityFacets> {
    const rows = await lightRows(query);
    const links = await projectLinksFor(rows.map((r) => r.id as string));
    await projectNames([...new Set(Object.values(links))]);
    return {
      byKind: {
        status: tally(rows.map((r) => r.status)),
        autonomy_level: tally(rows.map((r) => r.autonomy_level)),
        project: tally(rows.map((r) => links[r.id as string] ?? null)),
      },
    };
  },
};
