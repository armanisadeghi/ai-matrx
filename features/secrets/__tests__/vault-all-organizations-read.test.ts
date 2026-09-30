/**
 * THE ALL-ORGANIZATIONS VAULT READ (active-org-is-never-a-list-filter, AO-105 / AO-106).
 *
 * `fetchVaultItems({ kind: "organization", organizationId: null })` must read every
 * organization's credentials the person can open — no single-organization narrowing — and
 * judge each credential by ITS OWN organization's role. A filter change only: the read adds
 * no access check (RLS decides). The forcing outputs are the recorded query calls and the
 * per-item capabilities, which nothing else in the fixture can produce.
 */
const calls: Array<{ table: string; op: string; args: unknown[] }> = [];
const accessRpc = jest.fn(async (_fn: string, args: { p_organization_id: string }) => ({
  data: args.p_organization_id === "org-editor" ? "editor" : "use",
  error: null,
}));

const ITEMS = [
  { id: "a", user_id: "u2", organization_id: "org-editor", access_mode: "all_members" },
  { id: "b", user_id: "u2", organization_id: "org-use", access_mode: "all_members" },
  { id: "c", user_id: "u2", organization_id: "org-admin", access_mode: "all_members" },
];

function builder(table: string, rows: unknown[]) {
  const b: Record<string, unknown> = {};
  for (const op of ["select", "eq", "in", "not", "or", "is", "order", "neq"]) {
    b[op] = (...args: unknown[]) => {
      calls.push({ table, op, args });
      return b;
    };
  }
  b.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
  return b;
}

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({
      from: (table: string) =>
        builder(table, table === "credential_items" ? ITEMS : []),
      rpc: (fn: string, args: { p_organization_id: string }) =>
        fn === "my_organization_vault_access"
          ? accessRpc(fn, args)
          : Promise.resolve({ data: [], error: null }),
    }),
  }),
}));
jest.mock("@/utils/supabase/claimsUser", () => ({
  getClaimsUser: async () => ({ data: { user: { id: "u1" } }, error: null }),
}));

import { fetchVaultItems } from "../vault-service";

beforeEach(() => {
  calls.length = 0;
  accessRpc.mockClear();
});

describe("fetchVaultItems — all organizations", () => {
  it("reads every organization's credentials without a single-organization narrowing", async () => {
    await fetchVaultItems(
      { kind: "organization", organizationId: null },
      { orgAdminIds: ["org-admin"] },
    ).catch(() => undefined);
    const itemCalls = calls.filter((c) => c.table === "credential_items");
    // No `organization_id = <one>`; the read asks for every organization-owned row.
    expect(itemCalls.some((c) => c.op === "eq" && c.args[0] === "organization_id")).toBe(false);
    expect(
      itemCalls.some(
        (c) => c.op === "not" && c.args[0] === "organization_id" && c.args[1] === "is",
      ),
    ).toBe(true);
    // The shared-in grants are read for every organization too.
    const grantCalls = calls.filter((c) => c.table === "user_secret_grants");
    expect(grantCalls.some((c) => c.op === "eq" && c.args[0] === "organization_id")).toBe(false);
  });

  it("judges each credential by its own organization's role", async () => {
    const items = await fetchVaultItems(
      { kind: "organization", organizationId: null },
      { orgAdminIds: ["org-admin"] },
    );
    const byId = Object.fromEntries(items.map((i) => [i.id, i.capabilities]));
    // Editor in its organization: may edit. Plain use: may not. Admin there: everything.
    expect(byId.a?.can_edit).toBe(true);
    expect(byId.b?.can_edit).toBe(false);
    expect(byId.c?.can_manage).toBe(true);
    // One role lookup per organization the list touches, none for an admin organization.
    const asked = accessRpc.mock.calls.map(([, args]) => args.p_organization_id).sort();
    expect(asked).toEqual(["org-editor", "org-use"]);
  });

  it("still narrows to one organization when the filter names it", async () => {
    await fetchVaultItems(
      { kind: "organization", organizationId: "org-editor" },
      {},
    ).catch(() => undefined);
    expect(
      calls.some(
        (c) => c.table === "credential_items" && c.op === "eq" && c.args[1] === "org-editor",
      ),
    ).toBe(true);
  });
});
