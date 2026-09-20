// lib/organizations/__tests__/fixtures/aidreamOrganizationHoldEnvelope.ts
//
// A REAL BYTE-FOR-BYTE COPY of aidream's canonical "organization required"
// hold envelope — the pure builder in
// `packages/matrx-connect/matrx_connect/org_hold.py` (`organization_hold_detail`),
// re-exported by `aidream/services/organizations/org_hold.py`. THAT Python
// module is the source of truth for this shape's field names; this fixture is
// not a description of it, it is its literal output.
//
// Captured 2026-09-19 by running the builder directly against the aidream
// checkout (`.venv/bin/python3`, `packages/matrx-connect/matrx_connect/org_hold.py`):
//
//   detail = organization_hold_detail(
//       what="This request carried an identity but no organization.",
//       set_on="request",
//       organizations=[{
//           "id": "11111111-1111-1111-1111-111111111111",
//           "name": "Acme Robotics",
//           "abbreviation": "ACME",
//       }],
//   )
//
// which printed:
//
//   {
//     "error": "organization_required",
//     "code": "organization_required",
//     "message": "This request carried an identity but no organization.",
//     "user_message": "Choose the organization you're working in, then try again.",
//     "details": {
//       "hold": "organization_required",
//       "can_choose": true,
//       "set_on": "request",
//       "remedy": "Choose the organization you're working in and send it with the request (the X-Organization-Id header), then try again.",
//       "organizations": [
//         { "id": "11111111-1111-1111-1111-111111111111", "name": "Acme Robotics", "abbreviation": "ACME" }
//       ],
//       "memberships_url": "/auth/organizations"
//     }
//   }
//
// The contract test beside this fixture (`organizationHoldEnvelope.test.ts`)
// builds the SAME inputs through this repo's own emitter
// (`lib/organizations/organizationRequiredServerError.ts`'s
// `organizationRequiredEnvelope`) and asserts the output equals this object —
// not "has similar fields", equals it. A rename on either side breaks the
// build, which is the whole point of pinning a fixture instead of describing
// a shape in prose.

export const AIDREAM_ORGANIZATION_HOLD_MESSAGE =
  "This request carried an identity but no organization.";

export const AIDREAM_ORGANIZATION_HOLD_MEMBER = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Acme Robotics",
  abbreviation: "ACME",
};

export const AIDREAM_ORGANIZATION_HOLD_ENVELOPE = {
  error: "organization_required",
  code: "organization_required",
  message: AIDREAM_ORGANIZATION_HOLD_MESSAGE,
  user_message: "Choose the organization you're working in, then try again.",
  details: {
    hold: "organization_required",
    can_choose: true,
    set_on: "request",
    remedy:
      "Choose the organization you're working in and send it with the " +
      "request (the X-Organization-Id header), then try again.",
    organizations: [AIDREAM_ORGANIZATION_HOLD_MEMBER],
    memberships_url: "/auth/organizations",
  },
} as const;
