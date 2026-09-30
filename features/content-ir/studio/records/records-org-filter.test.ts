// The page's organization filter narrows EVERY lane of the kind-records list —
// Mine as well as My Orgs — and is never the active organization
// (common-docs /policies/active-org-is-never-a-list-filter.md). The builder
// below records every filter the reader sends, so the assertions read the
// query the database would have run.

const calls: Array<[string, ...unknown[]]> = [];

function makeBuilder() {
  const b: Record<string, unknown> = {};
  const chain = (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
      return b;
    };
  for (const m of ["select", "eq", "is", "in", "not", "or", "ilike", "gte", "lte", "order", "range"]) {
    b[m] = chain(m);
  }
  b.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: [], error: null, count: 0 });
  return b;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: () => ({ from: () => makeBuilder() }) },
}));
jest.mock("@/utils/supabase/claimsUser", () => ({
  getClaimsUser: async () => ({ data: { user: { id: "me" } }, error: null }),
}));
jest.mock("@/features/organizations/service", () => ({
  getUserOrganizations: async () => [],
  getOrganizationMembers: async () => [],
}));

import { listKindRecords } from "./records-service";

const base = {
  kindDefinitionId: "kind-1",
  searchKeys: [],
  numericKeys: [],
  search: "",
  confirmation: "all" as const,
  writer: "all" as const,
  archiveFilter: "active" as const,
  columnFilters: [],
  sort: "created_at" as never,
  direction: "desc" as const,
  page: 1,
  pageSize: 25,
};

beforeEach(() => {
  calls.length = 0;
});

describe("the organization filter narrows the Mine lane too", () => {
  it("Mine + a chosen org: created_by me AND organization_id = that org", async () => {
    await listKindRecords({ ...base, scope: { kind: "mine" }, orgId: "org-a" });
    expect(calls).toContainEqual(["eq", "created_by", "me"]);
    expect(calls).toContainEqual(["eq", "organization_id", "org-a"]);
  });

  it("Mine + All organizations: no organization narrowing", async () => {
    await listKindRecords({ ...base, scope: { kind: "mine" }, orgId: null });
    expect(calls).toContainEqual(["eq", "created_by", "me"]);
    expect(calls.some((c) => c[0] === "eq" && c[1] === "organization_id")).toBe(false);
  });
});
