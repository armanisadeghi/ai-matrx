/**
 * resolveActiveOrgContext.test.ts — BOOT ENDS WITH A SELECTION.
 *
 * The 2026-09-12 incident: a user with NINE org memberships and a null
 * `preferences->organization->>defaultOrganizationId` ended boot with
 * `organization_id = null`. The header still rendered an organization (it reads
 * the effective org, which falls back to the personal one), while every
 * transport threw `organization_context_required` —
 * "System jobs could not be loaded — Select an organization before sending this
 * request." The resolver only knew three rungs: stored cookie, stated default,
 * sole membership. None applied, so nothing was ever selected.
 *
 * SUT: the real `resolveActiveOrgContext` and its real rung order. The doubles
 * are only the things outside the resolver: the membership read, the
 * personal-org RPC wrapper, the shared apex cookie, and the Supabase
 * preferences read. No manufactured answer is fed to the code under test —
 * these are the four inputs the live system hands it.
 */

import { jest } from "@jest/globals";

const USER = "87a6e699-0000-4000-8000-000000000001";
const PERSONAL = "11111111-1111-4111-8111-111111111111";
const OTHER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type Org = {
  id: string;
  name: string;
  is_personal?: boolean;
  created_by?: string;
};

let orgs: Org[] = [];
let personalOrgId: string | null = PERSONAL;
let cookieOrgId: string | null = null;
let defaultOrgPreference: string | null = null;

jest.mock("@/features/organizations/service", () => ({
  getUserOrganizations: async () => orgs,
}));

jest.mock("@/lib/organizations/personalOrg", () => ({
  resolvePersonalOrgId: async () => {
    if (!personalOrgId) throw new Error("no personal org");
    return personalOrgId;
  },
  primePersonalOrgId: () => {},
}));

const cookieClear = jest.fn<() => void>();
jest.mock("@/lib/organizations/activeOrgCookie", () => ({
  activeOrgCookie: {
    read: () => cookieOrgId,
    clear: () => cookieClear(),
    write: () => {},
  },
}));

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                preferences: {
                  organization: {
                    defaultOrganizationId: defaultOrgPreference,
                  },
                },
              },
              error: null,
            }),
          }),
        }),
      }),
    }),
  },
}));

import { resolveActiveOrgContext } from "@/lib/organizations/resolveActiveOrgContext";

const membership = (id: string, name: string, personal = false): Org => ({
  id,
  name,
  is_personal: personal,
  created_by: personal ? USER : "someone-else",
});

beforeEach(() => {
  orgs = [];
  personalOrgId = PERSONAL;
  cookieOrgId = null;
  defaultOrgPreference = null;
  cookieClear.mockClear();
});

describe("resolveActiveOrgContext — the boot always ends with a selection", () => {
  it("selects the user's own personal org when they have many memberships and NO stated default (the 2026-09-12 incident)", async () => {
    orgs = [
      membership(OTHER_A, "Client A"),
      membership(PERSONAL, "Armani's workspace", true),
      membership(OTHER_B, "Client B"),
    ];

    const resolved = await resolveActiveOrgContext(USER);

    expect(resolved).not.toBeNull();
    expect(resolved!.organization_id).toBe(PERSONAL);
    expect(resolved!.organization_name).toBe("Armani's workspace");
    expect(resolved!.personal_organization_id).toBe(PERSONAL);
  });

  it("a stated default still outranks the personal org", async () => {
    orgs = [
      membership(OTHER_A, "Client A"),
      membership(PERSONAL, "Armani's workspace", true),
    ];
    defaultOrgPreference = OTHER_A;

    const resolved = await resolveActiveOrgContext(USER);
    expect(resolved!.organization_id).toBe(OTHER_A);
  });

  it("the stored apex cookie outranks everything below it", async () => {
    orgs = [
      membership(OTHER_A, "Client A"),
      membership(OTHER_B, "Client B"),
      membership(PERSONAL, "Armani's workspace", true),
    ];
    defaultOrgPreference = OTHER_A;
    cookieOrgId = OTHER_B;

    const resolved = await resolveActiveOrgContext(USER);
    expect(resolved!.organization_id).toBe(OTHER_B);
  });

  it("falls to the single membership when the personal-org RPC is unavailable", async () => {
    personalOrgId = null;
    orgs = [membership(OTHER_A, "Client A")];

    const resolved = await resolveActiveOrgContext(USER);
    expect(resolved!.organization_id).toBe(OTHER_A);
  });

  it("stays genuinely unresolved when several memberships exist and none can be named", async () => {
    // No cookie, no default, the personal-org RPC is down and no membership is
    // this user's own personal workspace: nothing may be invented.
    personalOrgId = null;
    orgs = [membership(OTHER_A, "Client A"), membership(OTHER_B, "Client B")];

    const resolved = await resolveActiveOrgContext(USER);
    expect(resolved!.organization_id).toBeNull();
  });
});
