/**
 * @jest-environment jsdom
 */
/**
 * LANE PAGE-BUNDLE-2 — THE BOOT READS HER ORGANIZATIONS AND PROJECTS ONCE.
 *
 * Every page load asks the scope tree twice, a moment apart: the skeleton (first paint) and the
 * whole tree (right behind it). Each read the same `iam.organizations` and `projects.projects`
 * rows — on production 8 organization and 4 project calls per page for admin@admin.com. The two
 * now share one read; an explicit refresh (`forgetSharedScopeBootRead`) asks again.
 */
const USER = "a3c1d2e4-5f60-4718-9a2b-3c4d5e6f7081";
const ORG = "7721ceda-72f0-4e4c-b712-00cf9dc8f117";
const PROJECT = "5d1f0c1e-2a3b-4c5d-9e8f-7a6b5c4d3e2f";

const counts = { organizations: 0, projects: 0, memberships: 0 };

jest.mock("@/utils/auth/getUserId", () => ({ getUserId: () => USER, requireUserId: () => USER }));
jest.mock("@/utils/supabase/adminLane", () => ({ browserAdminLaneOpen: () => false }));
jest.mock("@/features/organizations/service/membershipsService", () => ({
  membershipsService: {
    forUser: async () => {
      counts.memberships += 1;
      return { ok: true, data: { memberships: [{ containerId: ORG, role: "owner" }] } };
    },
    counts: async () => ({ ok: true, data: { counts: [{ containerId: ORG, memberCount: 3 }] } }),
  },
}));

function table(kind: "organizations" | "projects", rows: unknown[]) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "in", "is", "order", "eq", "range"]) q[m] = () => q;
  q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
    counts[kind] += 1;
    return Promise.resolve({ data: rows, error: null, count: rows.length }).then(res, rej);
  };
  return q;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: (name: string) => {
      if (name === "custom") {
        return {
          rpc: () =>
            Promise.resolve({
              data: {
                types: [{ id: "0b7c2f5e-1a2b-4c3d-8e9f-0a1b2c3d4e5f", organization_id: ORG, label_singular: "Site", label_plural: "Sites", icon: null, color: null, max_assignments_per_entity: null, sort_order: 0, default_variable_keys: null, slug: "site", description: null, created_at: "", updated_at: "" }],
                scopes: [],
              },
              error: null,
            }),
        };
      }
      return {
        from: () => table("organizations", [{ id: ORG, name: "Northwind Recycling", abbreviation: "NR", slug: "northwind", settings: {}, created_by: USER, archived_at: null }]),
      };
    },
  },
}));
jest.mock("@/utils/supabase/projectsDb", () => ({
  projectsDb: () => ({ from: () => table("projects", [{ id: PROJECT, organization_id: ORG, name: "Plant A", slug: "plant-a" }]) }),
}));
jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: {
    listForTargets: async () => ({ ok: true, data: { edges: [] } }),
    listForSources: async () => ({ ok: true, data: { edges: [] } }),
  },
}));

import { forgetSharedScopeBootRead, scopesService } from "@/features/scopes/service/scopesService";
import { getUserOrganizations } from "@/features/organizations/service";

beforeEach(() => {
  forgetSharedScopeBootRead();
  counts.organizations = counts.projects = counts.memberships = 0;
});

it("the skeleton and the whole tree of one boot read her organizations and projects once", async () => {
  const [skeleton, whole] = await Promise.all([
    scopesService.getScopeTree({ shape: "skeleton" }),
    scopesService.getScopeTree(),
  ]);
  const later = await scopesService.getScopeTree();
  expect(skeleton.ok && whole.ok && later.ok).toBe(true);
  expect(counts).toEqual({ organizations: 1, projects: 1, memberships: 1 });
  if (later.ok) expect(later.data.organizations.map((o) => o.id)).toEqual([ORG]);
});

it("a refresh asks again", async () => {
  await scopesService.getScopeTree();
  forgetSharedScopeBootRead();
  await scopesService.getScopeTree();
  expect(counts.organizations).toBe(2);
});

it("the member list (active and all) and the scope tree share the same one read of her organizations", async () => {
  const [active, all, tree] = await Promise.all([
    getUserOrganizations("active"),
    getUserOrganizations("all"),
    scopesService.getScopeTree({ shape: "skeleton" }),
  ]);
  expect(active.map((o) => o.id)).toEqual([ORG]);
  expect(all.map((o) => o.id)).toEqual([ORG]);
  expect(tree.ok).toBe(true);
  expect(counts.organizations).toBe(1);
  expect(counts.memberships).toBe(1);
});
