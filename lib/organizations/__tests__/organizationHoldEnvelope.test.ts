// lib/organizations/__tests__/organizationHoldEnvelope.test.ts
//
// THE CONTRACT: this repo's "organization required" refusal is the SAME
// envelope aidream answers with — field for field, not "similar". Before
// 2026-09-19 it was not: aidream nests the caller's choices under
// `details.organizations` (`packages/matrx-connect/matrx_connect/org_hold.py`
// → `organization_hold_detail`, re-exported by
// `aidream/services/organizations/org_hold.py`) while this repo answered a
// DIFFERENT shape — a top-level `memberships` field with no `details` at all.
// A client recogniser written against one silently mis-parsed the other.
//
// The fixture beside this test
// (`fixtures/aidreamOrganizationHoldEnvelope.ts`) is a byte-for-byte copy of
// that Python builder's own output — see its header for exactly how it was
// captured. This test builds the SAME inputs through this repo's emitter and
// asserts the two are equal, so a rename on either side fails the build
// instead of rotting silently.
//
// FORCING PROOF (recorded here, not just claimed): reverting
// `lib/organizations/organizationRequiredServerError.ts` to its pre-unification
// shape — a top-level `memberships: OrganizationMembershipSummary[]`, no
// `details` — makes `envelope matches aidream's organization_hold_detail
// output field for field` fail with "object is missing details.organizations"
// (Received: {..., memberships: [...]} vs Expected details.organizations).
// Confirmed 2026-09-19 by running this file against that reverted copy before
// restoring the fix; re-run any time with:
//   git show origin/main:lib/organizations/organizationRequiredServerError.ts
// (the pre-unification commit) swapped in for this file.

import {
  OrganizationRequiredServerError,
  organizationRequiredEnvelope,
} from "@/lib/organizations/organizationRequiredServerError";
import { isOrganizationRequiredEnvelope } from "@/lib/organizations/organizationRequiredError";
import {
  AIDREAM_ORGANIZATION_HOLD_ENVELOPE,
  AIDREAM_ORGANIZATION_HOLD_MEMBER,
  AIDREAM_ORGANIZATION_HOLD_MESSAGE,
} from "./fixtures/aidreamOrganizationHoldEnvelope";

describe("the organization-required envelope is ONE shape with aidream", () => {
  it("matches aidream's organization_hold_detail output field for field", () => {
    const error = new OrganizationRequiredServerError(
      AIDREAM_ORGANIZATION_HOLD_MESSAGE,
      [AIDREAM_ORGANIZATION_HOLD_MEMBER],
    );

    const envelope = organizationRequiredEnvelope(error);

    // Structural equality against the REAL Python output, not a description
    // of it — see the fixture's header for how it was captured.
    expect(envelope).toEqual(AIDREAM_ORGANIZATION_HOLD_ENVELOPE);
  });

  it("carries no top-level `memberships` field — the pre-unification shape is gone", () => {
    const error = new OrganizationRequiredServerError(
      AIDREAM_ORGANIZATION_HOLD_MESSAGE,
      [AIDREAM_ORGANIZATION_HOLD_MEMBER],
    );

    const envelope = organizationRequiredEnvelope(error) as unknown as Record<
      string,
      unknown
    >;

    expect(envelope.memberships).toBeUndefined();
    expect(envelope.details).toBeDefined();
    expect(
      (envelope.details as Record<string, unknown>).organizations,
    ).toEqual([AIDREAM_ORGANIZATION_HOLD_MEMBER]);
  });

  it("details.organizations is null (not []) when the caller's list could not be read — matching aidream's own null-means-unreadable convention", () => {
    const error = new OrganizationRequiredServerError(
      AIDREAM_ORGANIZATION_HOLD_MESSAGE,
      null,
    );

    const envelope = organizationRequiredEnvelope(error);

    expect(envelope.details.organizations).toBeNull();
  });

  it("the client recogniser reads the SAME envelope this repo emits — one shape, one reader", () => {
    const error = new OrganizationRequiredServerError(
      AIDREAM_ORGANIZATION_HOLD_MESSAGE,
      [AIDREAM_ORGANIZATION_HOLD_MEMBER],
    );

    const envelope = organizationRequiredEnvelope(error);

    expect(isOrganizationRequiredEnvelope(envelope)).toBe(true);
  });

  it("the client recogniser reads aidream's OWN literal fixture directly — proof the shapes are interchangeable, not merely similarly typed", () => {
    expect(isOrganizationRequiredEnvelope(AIDREAM_ORGANIZATION_HOLD_ENVELOPE)).toBe(
      true,
    );
  });
});
