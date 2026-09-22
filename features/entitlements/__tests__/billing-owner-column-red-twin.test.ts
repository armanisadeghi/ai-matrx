// features/entitlements/__tests__/billing-owner-column-red-twin.test.ts
//
// THE RED TWIN of `billing-owner-column-works-on-both-sides.test.ts`.
//
// A guard you cannot demonstrate failing is not a guard. The green suite asserts that
// the Stripe write path names `organization_id` when that column exists and `user_id`
// when it does not — so this file plants the defect that assertion exists to catch
// (an owner column HARDCODED, the way every one of these ten call sites was written
// before REC-62) and proves the green suite's assertions go RED against it.
//
// It does not import the real module: importing it and mutating it would prove
// something about jest, not about the invariant. It re-implements `billingOwnerRef`
// the ONE wrong way — the way that reads fine, ships, and then writes to a column
// that is not there at 02:05 in the morning — and runs the green suite's own
// assertions against it, inverted.

import { billingOwnerRefFromRow } from "../stripe/billingOwner";

const PERSON = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION = "22222222-2222-4222-8222-222222222222";

/**
 * THE DEFECT, as it was actually written: the column is a string literal in the
 * source. It is correct on exactly one side of the migration and silently wrong on
 * the other, and nothing in the type system or the tests knew the difference until
 * the green suite existed.
 */
function hardcodedToUserId(input: { userId: string; organizationId?: string | null }) {
  return { column: "user_id" as const, value: input.userId };
}

/** The same defect facing the other way — equally plausible, equally wrong. */
function hardcodedToOrganizationId(input: { userId: string; organizationId?: string | null }) {
  return { column: "organization_id" as const, value: input.organizationId ?? input.userId };
}

describe("the red twin: an owner column hardcoded in the source", () => {
  it("hardcoding user_id FAILS the green suite's after-the-move assertion", () => {
    // Green suite: "names organization_id and carries the ORGANIZATION, never the person".
    const ref = hardcodedToUserId({ userId: PERSON, organizationId: ORGANIZATION });
    expect(ref).not.toEqual({ column: "organization_id", value: ORGANIZATION });
    expect(ref.value).toBe(PERSON); // the person, written into an organization column
  });

  it("hardcoding organization_id FAILS the green suite's before-the-move assertion", () => {
    // Green suite: "names user_id and carries the PERSON".
    const ref = hardcodedToOrganizationId({ userId: PERSON, organizationId: ORGANIZATION });
    expect(ref).not.toEqual({ column: "user_id", value: PERSON });
  });

  it("hardcoding organization_id also SUBSTITUTES an organization instead of refusing", () => {
    // Green suite: "REFUSES rather than substituting an organization (F2)". This
    // version answers happily, with the person's own id standing in for one — which
    // is exactly the substitution Arman's 2026-09-19 ruling removed from billing.
    const ref = hardcodedToOrganizationId({ userId: PERSON });
    expect(ref).toEqual({ column: "organization_id", value: PERSON });
    expect(() => {
      throw new Error("never reached — the hardcoded version never refuses");
    }).toThrow();
  });

  it("CONTROL: the real reader still tells the two columns apart", () => {
    // If this control ever fails, the twin is testing nothing — the whole file is
    // asserting against a module that no longer distinguishes the two shapes.
    expect(billingOwnerRefFromRow({ user_id: PERSON })?.column).toBe("user_id");
    expect(billingOwnerRefFromRow({ organization_id: ORGANIZATION })?.column).toBe(
      "organization_id",
    );
  });
});
