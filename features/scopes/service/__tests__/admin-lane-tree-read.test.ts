/**
 * @jest-environment jsdom
 */
/**
 * THE ADMIN LANE arm of the tree loader (lane SCOPE-ADMIN-2): the per-
 * organization read the /administration scope console uses is REFUSED on a
 * user page before any request leaves the browser — on a user page a platform
 * admin is an ordinary member (Arman, 2026-09-25) — and, in the lane, reads
 * exactly the one organization it was asked for.
 */
const mockLaneOpen = jest.fn();
jest.mock("@/utils/supabase/adminLane", () => ({
  browserAdminLaneOpen: () => mockLaneOpen(),
}));
jest.mock("@/utils/auth/getUserId", () => ({
  getUserId: () => "a3c1d2e4-5f60-4718-9a2b-3c4d5e6f7081",
  requireUserId: () => "a3c1d2e4-5f60-4718-9a2b-3c4d5e6f7081",
}));

const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
function query(table: string, rows: unknown) {
  const entry = { table, filters: [] as Array<[string, unknown]> };
  calls.push(entry);
  const q: Record<string, unknown> = {};
  for (const m of ["select", "is", "order"]) q[m] = () => q;
  q.eq = (col: string, v: unknown) => {
    entry.filters.push([col, v]);
    return q;
  };
  q.maybeSingle = () => Promise.resolve({ data: rows, error: null });
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res);
  return q;
}
const ORG = "7721ceda-72f0-4e4c-b712-00cf9dc8f117";
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      from: (t: string) =>
        query(t, { id: ORG, name: "Northwind Recycling", abbreviation: "NR", slug: "northwind", is_personal: false, settings: {}, created_by: null, archived_at: null }),
    }),
  },
}));
jest.mock("@/utils/supabase/contextDb", () => ({
  contextDb: () => ({ from: (t: string) => query(t, []) }),
}));

import { scopesService } from "@/features/scopes/service/scopesService";

beforeEach(() => {
  calls.length = 0;
});

it("refuses on a user page, before any read", async () => {
  mockLaneOpen.mockReturnValue(false);
  const res = await scopesService.getOrganizationTreeForAdmin(ORG);
  expect(res.ok).toBe(false);
  expect(calls).toEqual([]);
});

it("in the admin lane, reads only the organization it was asked for", async () => {
  mockLaneOpen.mockReturnValue(true);
  const res = await scopesService.getOrganizationTreeForAdmin(ORG);
  expect(res).toMatchObject({ ok: true, data: { organization: { id: ORG, admin_lane: true, role: "admin" } } });
  expect(calls.map((c) => c.table).sort()).toEqual(["organizations", "scope_types", "scopes"]);
  for (const c of calls) {
    const col = c.table === "organizations" ? "id" : "organization_id";
    expect(c.filters).toContainEqual([col, ORG]);
  }
});
