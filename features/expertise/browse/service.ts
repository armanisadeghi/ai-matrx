import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { applyListScope } from "@/lib/list-scope/applyListScope";
import type {
  EntityFacets,
  EntityListPage,
  EntityListQuery,
  EntityListSort,
  EntityScopeCounts,
} from "@/lib/entity-list/types";
import { getUserOrganizations } from "@/features/organizations/service";
import type {
  ExpertisePackListRow,
  PackSource,
  PackStatus,
} from "../types";

/**
 * Entity-list service for /expertise — plain PostgREST over
 * platform.expertise_pack (no per-feature RPC yet; the pack population is
 * small). THE VIEW LAW: every scope is an explicit predicate, never bare RLS.
 * Scopes served: mine · orgs (blended via the user's membership list, or
 * narrowed to one org) · public.
 */

const SELECT_COLUMNS =
  "id,name,slug,description,source,principles,version,status,visibility,created_by,organization_id,created_at,updated_at";

const SORTABLE = new Set([
  "name",
  "status",
  "visibility",
  "version",
  "updated_at",
  "created_at",
]);

const DATE_BUCKET_MS: Record<string, number> = {
  "1h": 3600_000,
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  "90d": 90 * 86_400_000,
  "1y": 365 * 86_400_000,
};

/** My non-personal org ids, cached per session (memberships rarely change mid-list). */
let orgIdsCache: { ids: string[]; names: Map<string, string> } | null = null;

async function myOrgs(): Promise<{ ids: string[]; names: Map<string, string> }> {
  if (orgIdsCache) return orgIdsCache;
  const orgs = await getUserOrganizations();
  const names = new Map<string, string>();
  const ids: string[] = [];
  for (const org of orgs) {
    if (org.isPersonal) continue;
    ids.push(org.id);
    names.set(org.id, org.name);
  }
  orgIdsCache = { ids, names };
  return orgIdsCache;
}

/**
 * Structural query surface shared by the page and count builders. Interface
 * METHODS check bivariantly, so the typed PostgrestFilterBuilder satisfies
 * this without erasing to `any` (same approach as lib/list-scope's EqCapable).
 */
interface PackFilterable {
  eq(column: string, value: string): this;
  in(column: string, values: string[]): this;
  or(filters: string): this;
  gte(column: string, value: string): this;
  ilike(column: string, pattern: string): this;
}

function basePage() {
  return supabase
    .schema("platform")
    .from("expertise_pack")
    .select(SELECT_COLUMNS, { count: "exact" })
    .is("deleted_at", null);
}

function baseCount() {
  return supabase
    .schema("platform")
    .from("expertise_pack")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
}

/**
 * NOTE: this is deliberately synchronous — the query builder is a thenable, so
 * returning it from an async function (and awaiting that) would resolve the
 * QUERY instead of returning the builder. Blended-orgs ids are fetched by the
 * caller first.
 */
function applyScope<Q extends PackFilterable>(
  q: Q,
  scope: EntityListQuery["scope"],
  userId: string,
  blendedOrgIds: string[],
): Q | null {
  if (scope.kind === "public") return q.eq("visibility", "public");
  if (scope.kind === "orgs" && scope.organizationId === null) {
    if (blendedOrgIds.length === 0) return null;
    return q.in("organization_id", blendedOrgIds);
  }
  return applyListScope(q, scope, { userId });
}

function applyFilters<Q extends PackFilterable>(
  q: Q,
  query: EntityListQuery,
): Q {
  if (query.search.trim()) {
    const s = query.search.trim().replaceAll("%", "\\%");
    q = q.or(`name.ilike.%${s}%,description.ilike.%${s}%,slug.ilike.%${s}%`);
  }
  for (const [id, f] of Object.entries(query.filters)) {
    if (f.kind === "select" && f.values.length > 0) {
      if (id === "status" || id === "visibility") {
        q = q.in(id, f.values);
      } else if (id === "updated_at" || id === "created_at") {
        // Date filters are relative buckets; multiple selections = widest wins.
        const widest = Math.max(
          ...f.values.map((v) => DATE_BUCKET_MS[v] ?? 0),
        );
        if (widest > 0) {
          q = q.gte(id, new Date(Date.now() - widest).toISOString());
        }
      }
    } else if (f.kind === "text" && f.value.trim()) {
      const v = f.value.trim().replaceAll("%", "\\%");
      if (id === "name") q = q.ilike("name", `%${v}%`);
      else if (id === "author") q = q.ilike("source->>author", `%${v}%`);
    }
  }
  return q;
}

function toListRow(row: Record<string, unknown>): ExpertisePackListRow {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    description: String(row.description ?? ""),
    source: (row.source ?? {}) as PackSource,
    version: Number(row.version),
    status: row.status as PackStatus,
    visibility: row.visibility as ExpertisePackListRow["visibility"],
    principle_count: Array.isArray(row.principles) ? row.principles.length : 0,
    created_by: String(row.created_by),
    organization_id: String(row.organization_id),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function fetchExpertisePage(
  query: EntityListQuery,
  sort: EntityListSort,
): Promise<EntityListPage<ExpertisePackListRow>> {
  const userId = requireUserId();
  const { ids: blendedOrgIds } = await myOrgs();
  let q = applyScope(basePage(), query.scope, userId, blendedOrgIds);
  if (q === null) return { rows: [], total: 0 };
  q = applyFilters(q, query);

  const col = SORTABLE.has(sort.sort) ? sort.sort : "updated_at";
  const from = (query.page - 1) * sort.pageSize;
  const { data, error, count } = await q
    .order(col, { ascending: sort.direction === "asc" })
    .order("id", { ascending: true })
    .range(from, from + sort.pageSize - 1);
  if (error) throw new Error(`${error.message} (${error.code})`);
  return {
    rows: (data ?? []).map((r) => toListRow(r as unknown as Record<string, unknown>)),
    total: count ?? 0,
  };
}

export async function fetchExpertiseCounts(
  query: EntityListQuery,
): Promise<EntityScopeCounts> {
  const userId = requireUserId();
  const counts: EntityScopeCounts = {
    byKind: {},
    narrow: {},
  };

  const { ids, names } = await myOrgs();

  const countFor = async (
    scope: EntityListQuery["scope"],
  ): Promise<number> => {
    let q = applyScope(baseCount(), scope, userId, ids);
    if (q === null) return 0;
    q = applyFilters(q, query);
    const { count, error } = await q;
    if (error) throw new Error(`${error.message} (${error.code})`);
    return count ?? 0;
  };
  const [mine, orgsBlended, pub] = await Promise.all([
    countFor({ kind: "mine" }),
    countFor({ kind: "orgs", organizationId: null }),
    countFor({ kind: "public" }),
  ]);
  counts.byKind.mine = mine;
  counts.byKind.orgs = orgsBlended;
  counts.byKind.public = pub;

  if (ids.length > 1) {
    const perOrg = await Promise.all(
      ids.map(async (orgId) => ({
        id: orgId,
        label: names.get(orgId) ?? "Organization",
        count: await countFor({ kind: "orgs", organizationId: orgId }),
      })),
    );
    counts.narrow.orgs = perOrg.filter((o) => o.count > 0);
  }
  return counts;
}

export async function fetchExpertiseFacets(): Promise<EntityFacets> {
  // Status/visibility filter options are static on the columns; no server
  // facet counts needed at this population size.
  return { byKind: {} };
}

