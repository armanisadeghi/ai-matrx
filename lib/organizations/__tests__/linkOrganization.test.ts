/**
 * linkOrganization.test.ts — A LINK THAT NAMES AN ORGANIZATION IS HONOURED,
 * AND EVERY OTHER OUTCOME IS SAID OUT LOUD.
 *
 * THE DEFECT THIS FILE WAS WRITTEN AGAINST (lane TAILS-3, 2026-09-21)
 * ------------------------------------------------------------------
 * A notification's deep link carried no organization, so a person arriving
 * cold — from an email, a text, or the notifications screen in a fresh
 * session — landed on "Select an organization first" instead of the thing the
 * link named. The server half now stamps `?org=<uuid>` on every deep link the
 * platform emits. This is the client half: the app honours it.
 *
 * 🚨 WHY THIS IS NOT A DEFAULT-ORGANIZATION RUNG (the thing the guards refuse).
 * `check-no-default-organization` exists because nothing may PICK an
 * organization for a person out of a cookie, a saved preference, or their
 * personal workspace — each of those is the platform GUESSING. A link's `org=`
 * is the opposite of a guess: it is an explicit, externally-stated,
 * per-navigation instruction that names ONE organization, and it is honoured
 * only when the person is already a member of it. Nothing is substituted when
 * it is absent; the ladder below it is untouched.
 *
 * THE SIX BEHAVIOURS PINNED HERE:
 *   1. a link naming an organization they belong to is honoured on arrival;
 *   2. a link naming an organization they do NOT belong to refuses IN WORDS,
 *      without naming that organization, and switches them nowhere;
 *   3. a link naming the organization they are ALREADY working in is a silent
 *      no-op — no toast, no churn;
 *   4. a link naming a DIFFERENT organization than the one they are working in
 *      announces the move, so nobody is moved silently;
 *   5. the knob "switch organization when a link asks" (default ON) turns the
 *      switch into an offer, in words, with an explicit click;
 *   6. a malformed or unknown `org=` value is refused in words, never used.
 *
 * FIXTURES ARE REAL WORK, NOT Acme/foo. The person is a volunteer coordinator
 * who keeps the donor list for a regional food bank, does the books for a
 * plumbing company on the side, and is not a member of the microbiology lab
 * whose link someone forwarded her.
 */

import {
  LINK_ORGANIZATION_QUERY_KEY,
  readLinkOrganizationParam,
  decideLinkOrganization,
} from "@/lib/organizations/linkOrganization";

const FOOD_BANK = {
  id: "6f3b1c52-1d4a-4f7e-9c21-5b0a7d9e4411",
  name: "Second Harvest Valley Food Bank",
};
const PLUMBING = {
  id: "0a9d7e31-6c58-4b22-8e17-2f4c6a1b8890",
  name: "Bluejacket Plumbing & Drain",
};
/** She is NOT a member of this one. Its name must never reach her screen. */
const LAB_ID = "c41e8a06-7b93-4d15-9a6f-3e8b02d7c5aa";

const MEMBERSHIPS = [FOOD_BANK, PLUMBING];
const SIGNED_IN_AS = "coordinator@secondharvestvalley.org";

function decide(
  raw: string | null,
  opts: {
    current?: { id: string; name: string } | null;
    switchWhenALinkAsks?: boolean;
  } = {},
) {
  const search = raw === null ? "" : `?${LINK_ORGANIZATION_QUERY_KEY}=${raw}`;
  return decideLinkOrganization({
    param: readLinkOrganizationParam(search),
    memberships: MEMBERSHIPS,
    currentOrganizationId: opts.current?.id ?? null,
    currentOrganizationName: opts.current?.name ?? null,
    switchWhenALinkAsks: opts.switchWhenALinkAsks ?? true,
    signedInAs: SIGNED_IN_AS,
  });
}

describe("readLinkOrganizationParam", () => {
  it("reads the canonical `org` key the server stamps on every deep link", () => {
    expect(
      readLinkOrganizationParam(`?${LINK_ORGANIZATION_QUERY_KEY}=${FOOD_BANK.id}`),
    ).toEqual({ kind: "named", organizationId: FOOD_BANK.id });
    expect(LINK_ORGANIZATION_QUERY_KEY).toBe("org");
  });

  it("is absent when no link said anything — the ladder below is untouched", () => {
    expect(readLinkOrganizationParam("")).toEqual({ kind: "absent" });
    expect(readLinkOrganizationParam("?tab=donors")).toEqual({ kind: "absent" });
    expect(readLinkOrganizationParam(null)).toEqual({ kind: "absent" });
  });

  it("calls a value that is not a uuid MALFORMED rather than passing it on", () => {
    expect(readLinkOrganizationParam("?org=second-harvest")).toEqual({
      kind: "malformed",
      raw: "second-harvest",
    });
    expect(readLinkOrganizationParam("?org=")).toEqual({
      kind: "malformed",
      raw: "",
    });
  });
});

describe("a link that names an organization she belongs to", () => {
  it("is honoured on a cold arrival, so the donor list renders instead of the picker", () => {
    const d = decide(FOOD_BANK.id);
    expect(d.kind).toBe("honoured");
    if (d.kind !== "honoured") return;
    expect(d.organizationId).toBe(FOOD_BANK.id);
    expect(d.organizationName).toBe(FOOD_BANK.name);
    // Nothing to announce: she was not working anywhere, so she moved from
    // nothing. The destination simply renders.
    expect(d.announcement).toBeNull();
  });

  it("is a silent no-op when it names the organization she is already in", () => {
    const d = decide(FOOD_BANK.id, { current: FOOD_BANK });
    expect(d.kind).toBe("already-current");
    expect(JSON.stringify(d)).not.toContain("was not");
  });

  it("ANNOUNCES the move when it names a different organization than the one she is in", () => {
    const d = decide(PLUMBING.id, { current: FOOD_BANK });
    expect(d.kind).toBe("honoured");
    if (d.kind !== "honoured") return;
    expect(d.organizationId).toBe(PLUMBING.id);
    expect(d.announcement).toContain(PLUMBING.name);
    expect(d.announcement).toContain(FOOD_BANK.name);
  });
});

describe("a link that names an organization she does NOT belong to", () => {
  const d = decide(LAB_ID);

  it("refuses in words and switches her nowhere", () => {
    expect(d.kind).toBe("refused");
    if (d.kind !== "refused") return;
    // The shape itself carries no organization to switch to — there is no way
    // for a caller to move her on a refusal even by mistake.
    expect(Object.keys(d)).toEqual(["kind", "reason", "message"]);
  });

  it("never leaks the organization's name or id — she cannot see that org", () => {
    if (d.kind !== "refused") return;
    expect(d.message).not.toContain(LAB_ID);
    expect(d.message.toLowerCase()).not.toContain("microbiology");
  });

  it("says which account she is signed in as, and what to do about it", () => {
    if (d.kind !== "refused") return;
    expect(d.message).toContain(SIGNED_IN_AS);
    expect(d.message).toMatch(/sign in/i);
    expect(d.message).toMatch(/access/i);
  });
});

describe("the knob: switch organization when a link asks", () => {
  it("defaults ON — the decision honours the link with no knob passed", () => {
    const d = decideLinkOrganization({
      param: readLinkOrganizationParam(`?org=${PLUMBING.id}`),
      memberships: MEMBERSHIPS,
      currentOrganizationId: FOOD_BANK.id,
      currentOrganizationName: FOOD_BANK.name,
      signedInAs: SIGNED_IN_AS,
    });
    expect(d.kind).toBe("honoured");
  });

  it("turned OFF, does not switch her — it offers the switch as an explicit click", () => {
    const d = decide(PLUMBING.id, {
      current: FOOD_BANK,
      switchWhenALinkAsks: false,
    });
    expect(d.kind).toBe("offered");
    if (d.kind !== "offered") return;
    expect(d.organizationId).toBe(PLUMBING.id);
    expect(d.message).toContain(PLUMBING.name);
    expect(d.message).toContain(FOOD_BANK.name);
    expect(d.actionLabel).toContain(PLUMBING.name);
  });

  it("turned OFF still honours a link when she is working in NO organization — there is no switch to refuse", () => {
    const d = decide(FOOD_BANK.id, { switchWhenALinkAsks: false });
    expect(d.kind).toBe("honoured");
  });
});

describe("a malformed or unknown org= value", () => {
  it("is refused in words, never used, and never crashes", () => {
    const d = decide("second-harvest");
    expect(d.kind).toBe("refused");
    if (d.kind !== "refused") return;
    expect(d.message).toMatch(/link/i);
  });

  it("leaves her where she was", () => {
    const d = decide("%%%", { current: FOOD_BANK });
    expect(d.kind).toBe("refused");
  });

  it("says nothing at all when no link named an organization", () => {
    expect(decide(null).kind).toBe("no-link");
    expect(decide(null, { current: FOOD_BANK }).kind).toBe("no-link");
  });
});
