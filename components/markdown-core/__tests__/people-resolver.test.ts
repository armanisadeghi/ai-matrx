/**
 * Person mentions resolve in ONE member read per organization per render, and
 * only against members the viewer may see; signed out → no read, no chip.
 */
let session: object | null = { user: { id: "admin" } };
const rpcCalls: unknown[] = [];
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session } }) },
    rpc: (name: string, args: unknown) => {
      rpcCalls.push([name, args]);
      return Promise.resolve({
        data: [{ user_id: "9f1c0000-0000-4000-8000-000000000001", user_email: "dana@kilnworks.example", user_display_name: "Dana Ruiz", user_avatar_url: null, role: "member" }],
        error: null,
      });
    },
  }),
}));

import { resolvePerson } from "@/components/markdown-core/syntax/elements/people-resolver";

it("three mentions, one read; outsiders resolve to null", async () => {
  const org = "org-kilnworks";
  const [a, b, c] = await Promise.all([
    resolvePerson("9f1c0000-0000-4000-8000-000000000001", org),
    resolvePerson("9f1c0000-0000-4000-8000-000000000002", org),
    resolvePerson("9f1c0000-0000-4000-8000-000000000003", org),
  ]);
  expect(rpcCalls).toEqual([["get_organization_members_with_users", { p_org_id: org }]]);
  expect(a?.name).toBe("Dana Ruiz");
  expect(b).toBeNull();
  expect(c).toBeNull();
});

it("signed out: no read, no person", async () => {
  session = null;
  rpcCalls.length = 0;
  expect(await resolvePerson("9f1c0000-0000-4000-8000-000000000001", "org-other")).toBeNull();
  expect(rpcCalls).toEqual([]);
});
