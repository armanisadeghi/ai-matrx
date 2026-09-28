// Access ladder T-28: a personal credential shared into an organization's
// vault lives in THAT organization's list. resolveCredentialHome used to name
// "Shared with me" for every personal credential the person did not own, so
// clicking a "Shared in" row in the organization vault carried the person to
// a list that did not hold it and opened nothing.
const tables: Record<string, unknown> = {};

jest.mock("@/utils/supabase/client", () => {
  const query = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      maybeSingle: async () => ({ data: tables[table] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        resolve({ data: tables[table] ?? [], error: null }),
    };
    return chain;
  };
  const client = { schema: () => ({ from: query }) };
  return { createClient: () => client, supabase: client };
});
jest.mock("@/utils/supabase/claimsUser", () => ({
  getClaimsUser: async () => ({ data: { user: { id: "member-1" } }, error: null }),
}));

import { resolveCredentialHome } from "../vault-service";

const ITEM = { id: "item-1", user_id: "owner-1", organization_id: null };

describe("resolveCredentialHome — someone else's personal credential", () => {
  it("names the organization whose vault it was shared into", async () => {
    tables.credential_items = ITEM;
    tables.user_secret_grants = [{ user_id: null, organization_id: "org-pinecrest" }];
    await expect(resolveCredentialHome("item-1")).resolves.toEqual({
      state: "found",
      scope: { kind: "organization", organizationId: "org-pinecrest" },
    });
  });

  it("names Shared with me when it was shared with the person by name", async () => {
    tables.credential_items = ITEM;
    tables.user_secret_grants = [
      { user_id: "member-1", organization_id: null },
      { user_id: null, organization_id: "org-pinecrest" },
    ];
    await expect(resolveCredentialHome("item-1")).resolves.toEqual({
      state: "found",
      scope: { kind: "shared" },
    });
  });
});
