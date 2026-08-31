/**
 * Organization admission for `useApiAuth().getHeaders()` — the choke point
 * every hand-rolled consumer inherits (pdf-extractor streamers,
 * features/pdf/api/client.ts, podcast studio, agent-app tracking, …).
 *
 * Mirrors `lib/api/backend-client.ts` semantics exactly: both identified
 * lanes (JWT and guest fingerprint) run through the ONE fail-closed kernel,
 * so a missing organization throws `OrganizationContextError` BEFORE any
 * networking; an unidentified request skips the check entirely.
 */

jest.mock("@/lib/services/fingerprint-service", () => ({
  getFingerprint: jest.fn(),
}));

import { OrganizationContextError } from "@/lib/api/organization-context";
import { buildApiAuthHeaders } from "../useApiAuth";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";

describe("useApiAuth organization admission", () => {
  it("stamps X-Organization-Id on the JWT lane", () => {
    expect(
      buildApiAuthHeaders({
        accessToken: "jwt-token",
        fingerprintId: null,
        organizationId: ORGANIZATION_ID,
      }),
    ).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer jwt-token",
      "X-Organization-Id": ORGANIZATION_ID,
    });
  });

  it("stamps X-Organization-Id on the guest fingerprint lane", () => {
    expect(
      buildApiAuthHeaders({
        accessToken: null,
        fingerprintId: "fp-guest",
        organizationId: ORGANIZATION_ID,
      }),
    ).toEqual({
      "Content-Type": "application/json",
      "X-Fingerprint-ID": "fp-guest",
      "X-Organization-Id": ORGANIZATION_ID,
    });
  });

  it("fails closed before networking when an identified request has no organization", () => {
    expect(() =>
      buildApiAuthHeaders({
        accessToken: "jwt-token",
        fingerprintId: null,
        organizationId: null,
      }),
    ).toThrow(OrganizationContextError);
    expect(() =>
      buildApiAuthHeaders({
        accessToken: null,
        fingerprintId: "fp-guest",
        organizationId: null,
      }),
    ).toThrow(OrganizationContextError);
  });

  it("lets a caller-resolved authoritative organization win outright", () => {
    const headers = buildApiAuthHeaders({
      accessToken: "jwt-token",
      fingerprintId: null,
      organizationId: ORGANIZATION_ID,
      organizationIdOverride: OTHER_ORGANIZATION_ID,
    });
    expect(headers["X-Organization-Id"]).toBe(OTHER_ORGANIZATION_ID);
  });

  it("skips the organization check for an unidentified request, like backend-client's anonymous lane", () => {
    expect(
      buildApiAuthHeaders({
        accessToken: null,
        fingerprintId: null,
        organizationId: null,
      }),
    ).toEqual({ "Content-Type": "application/json" });
  });
});
