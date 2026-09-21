/**
 * resolveActiveOrgContext.test.ts — 🚨 BOOT NO LONGER PICKS AN ORGANIZATION
 * FOR ANYONE (Arman, 2026-09-19).
 *
 * WHAT THIS FILE USED TO ASSERT, AND WHY THAT IS NOW THE DEFECT.
 * ------------------------------------------------------------
 * It was written for the 2026-09-12 incident — a user with NINE memberships
 * and a null `preferences->organization->>defaultOrganizationId` ended boot
 * with `organization_id = null`, the header still rendered an organization
 * (it read the effective org, which substituted the personal one) and every
 * transport threw `organization_context_required`. The repair chosen then was
 * to make boot TOTAL: two more rungs were added to the ladder and this file
 * pinned both of them —
 *
 *   "selects the user's own personal org when they have many memberships and
 *    NO stated default"      → the personal-org rung
 *   "a stated default still outranks the personal org"
 *                            → the stored default-org preference rung
 *
 * — under the title "the boot always ends with a selection". Both rungs are
 * deleted, and so is that title. The ruling is that a "default organization"
 * is at most a per-client DISPLAY preference that only the org picker may
 * read, and that NOTHING — no boot ladder, no resolver, no transport — may
 * pick an organization for a person from a cookie, a saved preference, or
 * their personal workspace:
 *
 *   "one missed org check that should have just failed turns into 50 in a
 *    month and 5,000 in a year, and suddenly we don't have orgs any more, we
 *    have a user and a default org, which means we just have user now."
 *
 * So the two cases above no longer describe the contract; they describe the
 * two ways this resolver is allowed to fail. A member of many organizations
 * who has told THIS device nothing now ends boot at `organization_id: null`,
 * on purpose, and the first action that needs an organization HOLDS and asks
 * (`ensureOrgId` → the picker → the action resumes). A null selection is no
 * longer a dead end, so boot no longer has to guess to avoid one.
 *
 * WHAT IT ASSERTS NOW — the two surviving rungs, and the absence of the rest:
 *
 *   0. this device's REMEMBERED CHOICE (the shared apex cookie), used only
 *      while it still names a live membership, cleared when it does not;
 *   c. exactly ONE membership → that org (nothing to choose);
 *   d. otherwise null, DELIBERATELY, with `unreadableReason: null` so the UI
 *      spells the honest question rather than "we could not check".
 *
 * THE ANTI-REGRESSION HALF. Four cases below fail if a deleted rung grows
 * back, which is the point of the rewrite: the `user_preferences` double
 * THROWS and counts its calls, so a restored default-org read fails this
 * suite even if the resolver swallows the error; and the personal org is
 * planted in the membership list, as the user's OWN (`created_by === USER`,
 * `is_personal`), in every many-membership case — the exact shape the deleted
 * rung would have selected.
 *
 * SUT: the real `resolveActiveOrgContext` and its real rung order. The doubles
 * are only the things outside the resolver: the membership read, the
 * personal-org RPC wrapper, the shared apex cookie, and the Supabase client.
 * No manufactured answer is fed to the code under test.
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

/**
 * Every touch of the Supabase client from inside the resolver. The deleted
 * default-org rung was a `user_preferences` read through exactly this client,
 * so ONE entry here means the rung is back — and it is recorded BEFORE the
 * throw, so it indicts the resolver even if the read is wrapped in a
 * `try`/`catch` that quietly falls through to the next rung.
 */
const supabaseTouches: string[] = [];

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

// 🚨 THE DATABASE IS NOT AN INPUT TO THE SELECTION ANY MORE. The resolver may
// read memberships (through the service double above) and the personal-org RPC
// (through the wrapper double above) and NOTHING ELSE. This double therefore
// does not answer — it records the attempt and throws, naming the ruling, so a
// restored `readDefaultOrgIdFromDb` cannot pass this suite quietly.
jest.mock("@/utils/supabase/client", () => {
  const forbid = (call: string) => {
    supabaseTouches.push(call);
    throw new Error(
      `THE DELETED RUNG CAME BACK: resolveActiveOrgContext reached the database (${call}). ` +
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

const membership = (id: string, name: string, personal = false): Org => ({
  id,
  name,
  is_personal: personal,
  created_by: personal ? USER : "someone-else",
});

/** The shape the two deleted rungs existed to serve: several memberships, one
 *  of which is unmistakably this user's OWN personal workspace. */
const manyMembershipsIncludingTheirOwnPersonal = (): Org[] => [
  membership(OTHER_A, "Client A"),
  membership(PERSONAL, "Armani's workspace", true),
  membership(OTHER_B, "Client B"),
];

let warned: jest.SpiedFunction<typeof console.warn>;

beforeEach(() => {
  orgs = [];
  personalOrgId = PERSONAL;
  cookieOrgId = null;
  supabaseTouches.length = 0;
  cookieClear.mockClear();
  warned = jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  // No case in this file may reach the database. Asserted centrally so a new
  // case cannot forget it.
  expect(supabaseTouches).toEqual([]);
  warned.mockRestore();
});

describe("resolveActiveOrgContext — boot selects only what is not a choice", () => {
  it("a member of MANY organizations with nothing remembered on this device ends boot with NO selection", async () => {
    // The 2026-09-12 shape, answered the 2026-09-19 way. This case asserted
    // `organization_id === PERSONAL` until today; their own personal org is
    // still in the list, still theirs, and is still not selected.
    orgs = manyMembershipsIncludingTheirOwnPersonal();

    const resolved = await resolveActiveOrgContext(USER);

    expect(resolved).not.toBeNull();
    expect(resolved!.organization_id).toBeNull();
    expect(resolved!.organization_name).toBeNull();
    // Identity is still reported — the person's own workspace can be NAMED
    // without being SELECTED. That distinction is the whole ruling.
    expect(resolved!.personal_organization_id).toBe(PERSONAL);
    // And it is a real answer, not a degraded one: the memberships were read.
    // `unreadableReason` here would hide the one question only they can answer
    // behind a "Try again" button (R37).
    expect(resolved!.unreadableReason ?? null).toBeNull();
  });

  it("NEVER consults a stored default-organization preference — it does not read the database at all", async () => {
    // The deleted rung `readDefaultOrgIdFromDb` selected
    // `preferences->organization->>defaultOrganizationId`. There is no way to
    // set that preference in this fixture any more, on purpose: the proof is
    // that the QUERY never happens. The Supabase double throws and records, so
    // this fails whether a restored rung uses the answer, ignores it, or
    // swallows the error.
    orgs = manyMembershipsIncludingTheirOwnPersonal();

    const resolved = await resolveActiveOrgContext(USER);

    expect(supabaseTouches).toEqual([]);
    expect(resolved!.organization_id).toBeNull();
  });

  it("never selects the personal org, even when it is the ONLY organization the user owns", async () => {
    // The strongest form of the deleted rung b: two memberships, exactly one of
    // which is this user's own personal workspace, and no cookie. The rung
    // would have taken it. There is a choice here, so the person makes it.
    orgs = [
      membership(PERSONAL, "Armani's workspace", true),
      membership(OTHER_A, "Client A"),
    ];

    const resolved = await resolveActiveOrgContext(USER);

    expect(resolved!.organization_id).toBeNull();
    expect(resolved!.personal_organization_id).toBe(PERSONAL);
  });

  it("rung 0: this device's remembered choice is restored when it still names a membership", async () => {
    orgs = manyMembershipsIncludingTheirOwnPersonal();
    cookieOrgId = OTHER_B;

    const resolved = await resolveActiveOrgContext(USER);

    expect(resolved!.organization_id).toBe(OTHER_B);
    expect(resolved!.organization_name).toBe("Client B");
    expect(cookieClear).not.toHaveBeenCalled();
  });

  it("rung 0: a STALE remembered choice is dropped, not used — and does not become a selection", async () => {
    orgs = manyMembershipsIncludingTheirOwnPersonal();
    cookieOrgId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // left an org since

    const resolved = await resolveActiveOrgContext(USER);

    expect(cookieClear).toHaveBeenCalledTimes(1);
    // And it does not fall through to a substitute: the personal org is right
    // there in the list and is still not taken.
    expect(resolved!.organization_id).toBeNull();
  });

  it("rung c: exactly ONE membership is still selected — there was never a choice", async () => {
    orgs = [membership(OTHER_A, "Client A")];

    const resolved = await resolveActiveOrgContext(USER);

    expect(resolved!.organization_id).toBe(OTHER_A);
    expect(resolved!.organization_name).toBe("Client A");
  });

  it("a failed current_personal_org_id() no longer makes the SELECTION unreadable — the cookie still answers", async () => {
    // Until 2026-09-19 the personal RPC named a rung, so its failure degraded
    // the selection and set `unreadableReason`. It names no rung now: the two
    // surviving rungs read only the membership list. Dressing this up as "we
    // could not check" would put a Try again button in front of a question only
    // the person can answer.
    personalOrgId = null;
    orgs = manyMembershipsIncludingTheirOwnPersonal();
    cookieOrgId = OTHER_A;

    const resolved = await resolveActiveOrgContext(USER);

    expect(resolved!.organization_id).toBe(OTHER_A);
    expect(resolved!.unreadableReason ?? null).toBeNull();
    // It degrades IDENTITY only — and it announces itself (law 4), never
    // silently.
    expect(warned).toHaveBeenCalled();
  });

  it("a failed current_personal_org_id() with ONE membership still selects it, and still reads as answered", async () => {
    personalOrgId = null;
    orgs = [membership(OTHER_A, "Client A")];

    const resolved = await resolveActiveOrgContext(USER);

    expect(resolved!.organization_id).toBe(OTHER_A);
    expect(resolved!.personal_organization_id).toBeNull();
    expect(resolved!.unreadableReason ?? null).toBeNull();
  });

  it("several memberships and a failed personal read: still no selection, still an ANSWER not an outage", async () => {
    personalOrgId = null;
    orgs = [membership(OTHER_A, "Client A"), membership(OTHER_B, "Client B")];

    const resolved = await resolveActiveOrgContext(USER);

    expect(resolved!.organization_id).toBeNull();
    expect(resolved!.unreadableReason ?? null).toBeNull();
  });

  it("no memberships and no personal org is UNREADABLE, not a refusal", async () => {
    // The one case where `unreadableReason` is still non-null: the personal
    // read failed and there is no membership list to fall back on, so we cannot
    // even name this account's own workspace.
    personalOrgId = null;
    orgs = [];

    const resolved = await resolveActiveOrgContext(USER);

    expect(resolved!.organization_id).toBeNull();
    expect(resolved!.unreadableReason).toMatch(/personal-organization read failed/);
  });

  it("no memberships but a readable personal org: no selection, and no false outage", async () => {
    orgs = [];

    const resolved = await resolveActiveOrgContext(USER);

    expect(resolved!.organization_id).toBeNull();
    expect(resolved!.personal_organization_id).toBe(PERSONAL);
    expect(resolved!.unreadableReason).toBeNull();
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
    orgs = manyMembershipsIncludingTheirOwnPersonal();

    const resolved = await resolveActiveOrgContext(USER, {});

    expect(resolved!.organization_id).toBeNull();
    expect(resolved!.link).toBeUndefined();
  });
});
