/**
 * resolveActiveOrgContext.test.ts — THE LOAD LADDER (Arman, 2026-10-07):
 * "Active Org is set ONCE at the top of the app. Active Org can never be none."
 *
 * The rungs, each kept only while it is a CURRENT membership:
 *   0. this tab's held organization (refreshes only);
 *   1. the link's own organization (`?org=`);
 *   2. the account's last active organization;
 *   3. the account's start-up organization;
 *   4. the first organization — the OLDEST active membership (not the first
 *      by name, not the one the person created).
 * Zero memberships → null. A failed account read throws (honest retry state).
 *
 * SUT: the real resolver and rung order. Doubles: the membership reads and the
 * account's two choices (`accountOrganizationChoices`). The Supabase client
 * double THROWS — the resolver reaches the database only through those doors.
 */

import { jest } from "@jest/globals";

const USER = "87a6e699-0000-4000-8000-000000000001";
const OWN = "11111111-1111-4111-8111-111111111111";
const OTHER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type Org = {
  id: string;
  name: string;
  created_by?: string;
  slug?: string | null;
};

let orgs: Org[] = [];
let lastActive: string | null = null;
let startup: string | null = null;
let accountReadFails = false;
/** Membership join order (oldest first); defaults to the order of `orgs`. */
let joinOrder: string[] | null = null;

/**
 * Every touch of the Supabase client from inside the resolver. ONE entry here
 * means a database-backed rung is back — and it is recorded BEFORE the throw,
 * so it indicts the resolver even if the read is wrapped in a `try`/`catch`
 * that quietly falls through to the next rung.
 */
const supabaseTouches: string[] = [];

jest.mock("@/features/organizations/service", () => ({
  getUserOrganizations: async () => orgs,
}));

jest.mock("@/lib/organizations/accountOrganizationChoices", () => ({
  readAccountOrganizationChoices: async () => {
    if (accountReadFails) throw new Error("the account's organization read failed: offline");
    return { lastActiveOrganizationId: lastActive, startupOrganizationId: startup };
  },
}));

jest.mock("@/features/organizations/service/membershipsService", () => ({
  membershipsService: {
    forUser: async () => ({
      data: {
        memberships: (joinOrder ?? orgs.map((o) => o.id)).map((id, i) => ({
          id: `m-${i}`,
          organizationId: id,
          containerId: id,
          userId: USER,
          role: "member",
          status: "active",
          createdAt: `2026-0${(i % 9) + 1}-01T00:00:00Z`,
        })),
      },
    }),
  },
}));

// 🚨 THE DATABASE IS NOT AN INPUT TO THE SELECTION. The resolver may read
// memberships (through the service double above) and NOTHING ELSE. This double
// therefore does not answer — it records the attempt and throws, naming the
// ruling.
jest.mock("@/utils/supabase/client", () => {
  const forbid = (call: string) => {
    supabaseTouches.push(call);
    throw new Error(
      `A DELETED RUNG CAME BACK: resolveActiveOrgContext reached the database (${call}). ` +
        "Since 2026-09-19 a stored preselected organization is a DISPLAY preference " +
        "that only the org picker may read; nothing may select from it.",
    );
  };
  return {
    supabase: {
      schema: (name: string) => forbid(`schema(${name})`),
      from: (table: string) => forbid(`from(${table})`),
      rpc: (fn: string) => forbid(`rpc(${fn})`),
    },
  };
});

import { resolveActiveOrgContext } from "@/lib/organizations/resolveActiveOrgContext";

const membership = (id: string, name: string, own = false): Org => ({
  id,
  name,
  created_by: own ? USER : "someone-else",
});

/** Several memberships, one of which this user created at signup. */
const manyMemberships = (): Org[] => [
  membership(OWN, "Armani's organization", true),
  membership(OTHER_A, "Client A"),
  membership(OTHER_B, "Client B"),
];

beforeEach(() => {
  orgs = [];
  lastActive = null;
  startup = null;
  accountReadFails = false;
  joinOrder = null;
  supabaseTouches.length = 0;
});

afterEach(() => {
  // No case in this file may reach the database. Asserted centrally so a new
  // case cannot forget it.
  expect(supabaseTouches).toEqual([]);
});

describe("resolveActiveOrgContext — the load ladder never ends with none", () => {
  it("rung 2: the account's LAST ACTIVE organization opens, on any device", async () => {
    orgs = manyMemberships();
    lastActive = OTHER_B;
    startup = OTHER_A;
    const resolved = await resolveActiveOrgContext(USER);
    expect(resolved!.organization_id).toBe(OTHER_B);
    expect(resolved!.organization_name).toBe("Client B");
  });

  it("rung 3: with no last active, the START-UP organization opens", async () => {
    orgs = manyMemberships();
    startup = OTHER_A;
    const resolved = await resolveActiveOrgContext(USER);
    expect(resolved!.organization_id).toBe(OTHER_A);
  });

  it("rung 4: with neither, the OLDEST membership opens — not the first by name", async () => {
    orgs = manyMemberships();
    joinOrder = [OTHER_B, OWN, OTHER_A];
    const resolved = await resolveActiveOrgContext(USER);
    expect(resolved!.organization_id).toBe(OTHER_B);
    expect(resolved!.unreadableReason ?? null).toBeNull();
  });

  it("a last active organization she was REMOVED from is skipped, never used", async () => {
    orgs = manyMemberships();
    lastActive = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    startup = OTHER_A;
    const resolved = await resolveActiveOrgContext(USER);
    expect(resolved!.organization_id).toBe(OTHER_A);
  });

  it("rung 0: a tab's HELD organization stays — another tab moving last active never pulls it", async () => {
    orgs = manyMemberships();
    lastActive = OTHER_B;
    const resolved = await resolveActiveOrgContext(USER, { heldOrganizationId: OTHER_A });
    expect(resolved!.organization_id).toBe(OTHER_A);
  });

  it("a held organization that is no longer hers is replaced by the ladder", async () => {
    orgs = manyMemberships();
    lastActive = OTHER_B;
    const resolved = await resolveActiveOrgContext(USER, {
      heldOrganizationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    });
    expect(resolved!.organization_id).toBe(OTHER_B);
  });

  it("a FAILED account read throws — the caller shows retry, never a guess", async () => {
    orgs = manyMemberships();
    accountReadFails = true;
    await expect(resolveActiveOrgContext(USER)).rejects.toThrow("offline");
  });

  it("no memberships at all resolves to null — the shell offers to create one", async () => {
    orgs = [];
    const resolved = await resolveActiveOrgContext(USER);
    expect(resolved).toBeNull();
  });
});

/**
 * THE LINK'S OWN ORGANIZATION — a new rung ABOVE this device's remembered
 * choice (lane TAILS-4, 2026-09-21).
 *
 * A notification's deep link now carries `?org=<uuid>` (the server half). A
 * person arriving cold used to land on "Select an organization first" instead
 * of the thing the link named. The rung is above the cookie because the link
 * is NEWER and more specific than what this browser happens to remember: the
 * cookie says "where you were last", the link says "where THIS thing lives".
 *
 * 🚨 IT IS STILL NOT A DEFAULT, and these cases are what prove it: the link is
 * checked against the live membership list and refused when it does not match,
 * and it never reaches the database (the central `supabaseTouches` assertion in
 * `afterEach` covers every case below too). Absent, it changes nothing.
 *
 * The person here keeps the donor list for a regional food bank and does the
 * books for a plumbing company; the third id is a microbiology lab she has
 * never been a member of, whose link a colleague forwarded her by mistake.
 */
describe("resolveActiveOrgContext — a link that names an organization", () => {
  const FOOD_BANK = "6f3b1c52-1d4a-4f7e-9c21-5b0a7d9e4411";
  const PLUMBING = "0a9d7e31-6c58-4b22-8e17-2f4c6a1b8890";
  const LAB = "c41e8a06-7b93-4d15-9a6f-3e8b02d7c5aa";

  const twoBusinesses = (): Org[] => [
    membership(FOOD_BANK, "Second Harvest Valley Food Bank"),
    membership(PLUMBING, "Bluejacket Plumbing & Drain"),
  ];

  it("is honoured on a cold arrival, so the donor list renders instead of the picker", async () => {
    orgs = twoBusinesses();

    const resolved = await resolveActiveOrgContext(USER, {
      linkOrganizationId: PLUMBING,
    });

    expect(resolved!.organization_id).toBe(PLUMBING);
    expect(resolved!.organization_name).toBe("Bluejacket Plumbing & Drain");
    expect(resolved!.link?.kind).toBe("honoured");
  });

  it("outranks this device's remembered choice — the link is the newer, more specific fact", async () => {
    orgs = twoBusinesses();
    lastActive = FOOD_BANK;

    const resolved = await resolveActiveOrgContext(USER, {
      linkOrganizationId: PLUMBING,
    });

    expect(resolved!.organization_id).toBe(PLUMBING);
    // And the move is ANNOUNCED — nobody is relocated silently (law 4).
    expect(resolved!.link?.kind).toBe("honoured");
    if (resolved!.link?.kind === "honoured") {
      expect(resolved!.link.announcement).toContain("Bluejacket Plumbing & Drain");
      expect(resolved!.link.announcement).toContain("Second Harvest Valley Food Bank");
    }
  });

  it("is a silent no-op when it names the organization she is already working in", async () => {
    orgs = twoBusinesses();
    lastActive = FOOD_BANK;

    const resolved = await resolveActiveOrgContext(USER, {
      linkOrganizationId: FOOD_BANK,
    });

    expect(resolved!.organization_id).toBe(FOOD_BANK);
    expect(resolved!.link?.kind).toBe("already-current");
  });

  it("names an organization she is NOT a member of: refused in words, and she is moved NOWHERE", async () => {
    orgs = twoBusinesses();
    lastActive = FOOD_BANK;

    const resolved = await resolveActiveOrgContext(USER, {
      linkOrganizationId: LAB,
      signedInAs: "coordinator@secondharvestvalley.org",
    });

    // Left exactly where she was — not switched, and NOT dropped to the picker.
    expect(resolved!.organization_id).toBe(FOOD_BANK);
    expect(resolved!.link?.kind).toBe("refused");
    if (resolved!.link?.kind === "refused") {
      expect(resolved!.link.reason).toBe("not-a-member");
      expect(resolved!.link.message).toContain("coordinator@secondharvestvalley.org");
      // The organization she cannot see is never named or numbered.
      expect(resolved!.link.message).not.toContain(LAB);
    }
  });

  it("a malformed org= is refused in words, never used, and never crashes the boot", async () => {
    orgs = twoBusinesses();

    const resolved = await resolveActiveOrgContext(USER, {
      linkOrganizationId: "second harvest!",
    });

    // The ladder ran exactly as if no link existed: two memberships, nothing
    // remembered, so no selection — the honest answer, not a guess.
    // The ladder still answers: the oldest membership.
    expect(resolved!.organization_id).toBe(FOOD_BANK);
    expect(resolved!.link?.kind).toBe("refused");
    if (resolved!.link?.kind === "refused") {
      expect(resolved!.link.reason).toBe("malformed");
    }
  });

  it("an ADDRESS (slug) she belongs to is honoured like an id — the /hr routes write it", async () => {
    orgs = [
      { ...membership(FOOD_BANK, "Second Harvest Valley Food Bank"), slug: "second-harvest" },
      { ...membership(PLUMBING, "Bluejacket Plumbing & Drain"), slug: "bluejacket" },
    ];
    lastActive = PLUMBING;

    const resolved = await resolveActiveOrgContext(USER, {
      linkOrganizationId: "second-harvest",
    });

    expect(resolved!.organization_id).toBe(FOOD_BANK);
    expect(resolved!.link?.kind).toBe("honoured");
  });

  it("with the knob OFF, a differing-organization link does not switch her — it offers the switch", async () => {
    orgs = twoBusinesses();
    lastActive = FOOD_BANK;

    const resolved = await resolveActiveOrgContext(USER, {
      linkOrganizationId: PLUMBING,
      switchWhenALinkAsks: false,
    });

    expect(resolved!.organization_id).toBe(FOOD_BANK);
    expect(resolved!.link?.kind).toBe("offered");
    if (resolved!.link?.kind === "offered") {
      expect(resolved!.link.organizationId).toBe(PLUMBING);
      expect(resolved!.link.actionLabel).toContain("Bluejacket Plumbing & Drain");
    }
  });

  it("no link at all leaves every existing rung untouched — this is not a default", async () => {
    orgs = manyMemberships();

    const resolved = await resolveActiveOrgContext(USER, {});

    expect(resolved!.organization_id).toBe(OWN);
    expect(resolved!.link).toBeUndefined();
  });
});
