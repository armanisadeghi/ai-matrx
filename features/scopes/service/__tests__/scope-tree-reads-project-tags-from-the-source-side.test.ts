/**
 * @jest-environment jsdom
 */
/**
 * THE BOOT SCOPE TREE (`scopesService.getScopeTree`, loaded when any
 * right-click menu with an entity mounts) reads project tags from the SOURCE
 * side and reads every scope.
 *
 * The defect (2026-09-27): `rpc/assoc_for_targets` answered HTTP 500 —
 * Postgres 57014, statement timeout — on /hr/settings/employer and /crm/<id>.
 * The tree asked `assoc_for_targets('scope', <every scope id>)` for every edge
 * INTO every scope from every source type, just to keep the project edges; for
 * admin@admin.com that was 1000 scope ids, ~2000 edges, 3–4 s per page, paged
 * twice, against an 8 s limit. The scopes read itself was capped at 1000 of
 * 2296 rows, so the project-tagged scopes were not even in the id list.
 *
 * Guard: the tree must (1) never call the target-side read, (2) ask for the
 * project → scope edges of its projects, and (3) carry scopes past row 1000.
 */
const USER = "a3c1d2e4-5f60-4718-9a2b-3c4d5e6f7081";
const ORG = "7721ceda-72f0-4e4c-b712-00cf9dc8f117";
const TYPE = "0b7c2f5e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
const PROJECT_A = "5d1f0c1e-2a3b-4c5d-9e8f-7a6b5c4d3e2f";
const PROJECT_B = "6e2a1d2f-3b4c-4d6e-8f9a-8b7c6d5e4f3a";

jest.mock("@/utils/auth/getUserId", () => ({
  getUserId: () => USER,
  requireUserId: () => USER,
}));
jest.mock("@/utils/supabase/adminLane", () => ({ browserAdminLaneOpen: () => false }));
jest.mock("@/features/organizations/service/membershipsService", () => ({
  membershipsService: {
    forUser: async () => ({ ok: true, data: { memberships: [{ containerId: ORG, role: "owner" }] } }),
  },
}));

// 2296 live scopes in the one organization — the admin's real count.
const SCOPE_COUNT = 2296;
const scopeRows = Array.from({ length: SCOPE_COUNT }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  scope_type_id: TYPE,
  organization_id: ORG,
  name: `Establishment ${i}`,
  description: null,
  parent_scope_id: null,
  settings: {},
  slug: `establishment-${i}`,
  sort_order: i,
  created_by: USER,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
}));
const LAST_SCOPE = scopeRows[SCOPE_COUNT - 1].id;

/** A PostgREST-shaped builder: honours `.range()` and caps at 1000 like the server. */
function table(rows: unknown[]) {
  let range: [number, number] | null = null;
  const q: Record<string, unknown> = {};
  for (const m of ["select", "in", "is", "order", "eq"]) q[m] = () => q;
  q.range = (from: number, to: number) => {
    range = [from, to];
    return q;
  };
  q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
    const [from, to] = range ?? [0, rows.length - 1];
    const page = rows.slice(from, Math.min(to, from + 999) + 1);
    return Promise.resolve({ data: page, error: null, count: rows.length }).then(res, rej);
  };
  return q;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      from: () =>
        table([{ id: ORG, name: "Northwind Recycling", abbreviation: "NR", slug: "northwind", settings: {}, created_by: USER, archived_at: null }]),
    }),
  },
}));
jest.mock("@/utils/supabase/contextDb", () => ({
  contextDb: () => ({
    from: (t: string) =>
      t === "scopes"
        ? table(scopeRows)
        : table([{ id: TYPE, organization_id: ORG, label_singular: "Establishment", label_plural: "Establishments", icon: null, color: null, max_assignments_per_entity: null, sort_order: 0, parent_type_id: null, default_variable_keys: [], slug: "establishment", description: null, created_at: "", updated_at: "" }]),
  }),
}));
jest.mock("@/utils/supabase/workspaceDb", () => ({
  workspaceDb: () => ({
    from: () =>
      table([
        { id: PROJECT_A, organization_id: ORG, name: "Plant A", slug: "plant-a" },
        { id: PROJECT_B, organization_id: ORG, name: "Plant B", slug: "plant-b" },
      ]),
  }),
}));

// What the target-side read really answers for the first 1000 scopes: no project edge.
const listForTargets = jest.fn(async (..._args: unknown[]) => ({ ok: true, data: { edges: [] } }));
const listForSources = jest.fn(async (_type: string, _ids: string[], _target?: string) => ({
  ok: true,
  data: { edges: [{ sourceType: "project", sourceId: PROJECT_A, targetType: "scope", targetId: LAST_SCOPE }] },
}));
jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: {
    listForTargets: (...a: unknown[]) => listForTargets(...a),
    listForSources: (type: string, ids: string[], target?: string) => listForSources(type, ids, target),
  },
}));

import { scopesService } from "@/features/scopes/service/scopesService";

it("reads the project → scope edges from the source side, never every edge into every scope", async () => {
  const res = await scopesService.getScopeTree();
  expect(res.ok).toBe(true);
  expect(listForTargets).not.toHaveBeenCalled();
  expect(listForSources).toHaveBeenCalledTimes(1);
  const [sourceType, ids, targetType] = listForSources.mock.calls[0];
  expect(sourceType).toBe("project");
  expect([...ids].sort()).toEqual([PROJECT_A, PROJECT_B].sort());
  expect(targetType).toBe("scope");
});

it("carries every scope past PostgREST's 1000-row cap, and the project tag that lives past it", async () => {
  const res = await scopesService.getScopeTree();
  if (!res.ok) throw new Error(res.error.message);
  const org = res.data.organizations[0];
  const scopes = org.scope_types.flatMap((t) => t.scopes);
  expect(scopes).toHaveLength(SCOPE_COUNT);
  expect(org.projects.find((p) => p.id === PROJECT_A)?.scope_ids).toEqual([LAST_SCOPE]);
  expect(org.projects.find((p) => p.id === PROJECT_B)?.scope_ids).toEqual([]);
});
