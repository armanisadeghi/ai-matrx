/**
 * resolveActiveOrgContext.test.ts — BOOT NEVER PICKS AN ORGANIZATION FOR
 * ANYONE (Arman, 2026-09-19).
 *
 * A "default organization" is at most a per-client DISPLAY preference that
 * only the org picker may read. NOTHING — no boot ladder, no resolver, no
 * transport — may pick an organization for a person from a cookie the server
 * trusts, a saved preference, or "their first/oldest" organization:
 *
 *   "one missed org check that should have just failed turns into 50 in a
 *    month and 5,000 in a year, and suddenly we don't have orgs any more, we
 *    have a user and a default org, which means we just have user now."
 *
 * WHAT IT ASSERTS — the surviving rungs, and the absence of the rest:
 *
 *   0. this device's REMEMBERED CHOICE (the shared apex cookie), used only
 *      while it still names a live membership, cleared when it does not;
 *   c. exactly ONE membership → that org (nothing to choose);
 *   d. otherwise null, DELIBERATELY, with `unreadableReason: null` so the UI
 *      spells the honest question rather than "we could not check".
 *
 * THE ANTI-REGRESSION HALF. The Supabase double THROWS and counts its calls,
 * so a restored default-org read (or any other database-backed rung) fails
 * this suite even if the resolver swallows the error. The first membership in
 * every many-membership fixture is the one the person CREATED — the exact
 * shape a "first/own org" rung would select.
 *
 * SUT: the real `resolveActiveOrgContext` and its real rung order. The doubles
 * are only the things outside the resolver: the membership read, the shared
 * apex cookie, and the Supabase client.
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
};

let orgs: Org[] = [];
let cookieOrgId: string | null = null;

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

const cookieClear = jest.fn<() => void>();
jest.mock("@/lib/organizations/activeOrgCookie", () => ({
  activeOrgCookie: {
    read: () => cookieOrgId,
    clear: () => cookieClear(),
    write: () => {},
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
        "Since 2026-09-19 a stored default organization is a DISPLAY preference " +
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
  cookieOrgId = null;
  supabaseTouches.length = 0;
  cookieClear.mockClear();
});

afterEach(() => {
  // No case in this file may reach the database. Asserted centrally so a new
  // case cannot forget it.
  expect(supabaseTouches).toEqual([]);
});

describe("resolveActiveOrgContext — boot selects only what is not a choice", () => {
  it("a member of MANY organizations with nothing remembered on this device ends boot with NO selection", async () => {
    orgs = manyMemberships();

    const resolved = await resolveActiveOrgContext(USER);

    expect(resolved).not.toBeNull();
    expect(resolved!.organization_id).toBeNull();
    expect(resolved!.organization_name).toBeNull();
    // A real answer, not a degraded one: the memberships were read.
    // `unreadableReason` here would hide the one question only they can answer
    // behind a "Try again" button (R37).
    expect(resolved!.unreadableReason ?? null).toBeNull();
  });

  it("NEVER consults a stored default-organization preference — it does not read the database at all", async () => {
    orgs = manyMemberships();

    const resolved = await resolveActiveOrgContext(USER);

    expect(supabaseTouches).toEqual([]);
    expect(resolved!.organization_id).toBeNull();
  });

  it("never selects the organization the user created, even when it is the only one they created", async () => {
    orgs = [membership(OWN, "Armani's organization", true), membership(OTHER_A, "Client A")];

    const resolved = await resolveActiveOrgContext(USER);

    expect(resolved!.organization_id).toBeNull();
  });

  it("rung 0: this device's remembered choice is restored when it still names a membership", async () => {
    orgs = manyMemberships();
    cookieOrgId = OTHER_B;

    const resolved = await resolveActiveOrgContext(USER);

    expect(resolved!.organization_id).toBe(OTHER_B);
    expect(resolved!.organization_name).toBe("Client B");
    expect(cookieClear).not.toHaveBeenCalled();
  });

  it("rung 0: a STALE remembered choice is dropped, not used — and does not become a selection", async () => {
    orgs = manyMemberships();
    cookieOrgId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // left an org since

    const resolved = await resolveActiveOrgContext(USER);

    expect(cookieClear).toHaveBeenCalledTimes(1);
    // And it does not fall through to a substitute.
    expect(resolved!.organization_id).toBeNull();
  });

  it("rung c: exactly ONE membership is still selected — there was never a choice", async () => {
    orgs = [membership(OTHER_A, "Client A")];

    const resolved = await resolveActiveOrgContext(USER);

    expect(resolved!.organization_id).toBe(OTHER_A);
    expect(resolved!.organization_name).toBe("Client A");
  });

  it("several memberships: no selection, and an ANSWER not an outage", async () => {
    orgs = [membership(OTHER_A, "Client A"), membership(OTHER_B, "Client B")];

    const resolved = await resolveActiveOrgContext(USER);

    expect(resolved!.organization_id).toBeNull();
    expect(resolved!.unreadableReason ?? null).toBeNull();
  });

  it("no memberships at all resolves to null — nothing to select, nothing to ask", async () => {
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
      linkOrganizationId: FOOD_BANK,
    });

    expect(resolved!.organization_id).toBe(FOOD_BANK);
    expect(resolved!.organization_name).toBe("Second Harvest Valley Food Bank");
    expect(resolved!.link?.kind).toBe("honoured");
  });

  it("outranks this device's remembered choice — the link is the newer, more specific fact", async () => {
    orgs = twoBusinesses();
    cookieOrgId = FOOD_BANK;

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
    cookieOrgId = FOOD_BANK;

    const resolved = await resolveActiveOrgContext(USER, {
      linkOrganizationId: FOOD_BANK,
    });

    expect(resolved!.organization_id).toBe(FOOD_BANK);
    expect(resolved!.link?.kind).toBe("already-current");
  });

  it("names an organization she is NOT a member of: refused in words, and she is moved NOWHERE", async () => {
    orgs = twoBusinesses();
    cookieOrgId = FOOD_BANK;

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
      linkOrganizationId: "second-harvest",
    });

    // The ladder ran exactly as if no link existed: two memberships, nothing
    // remembered, so no selection — the honest answer, not a guess.
    expect(resolved!.organization_id).toBeNull();
    expect(resolved!.link?.kind).toBe("refused");
    if (resolved!.link?.kind === "refused") {
      expect(resolved!.link.reason).toBe("malformed");
    }
  });

  it("with the knob OFF, a differing-organization link does not switch her — it offers the switch", async () => {
    orgs = twoBusinesses();
    cookieOrgId = FOOD_BANK;

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

    expect(resolved!.organization_id).toBeNull();
    expect(resolved!.link).toBeUndefined();
  });
});
