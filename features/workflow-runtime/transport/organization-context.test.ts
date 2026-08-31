/**
 * Organization admission for the workflow-runtime stream transports — the
 * ONE helper both `adoptWorkflowRun`'s `getHeaders` (run row + event replay
 * fetches, live SSE) and `useRunAnnouncements`' connect-time headers
 * (`/runs/stream`) stamp their headers through.
 */

import type { RootState } from "@/lib/redux/store";
import { stampRunStreamOrganizationContext } from "./organization-context";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";

function stateWithOrganization(organizationId: string | null): RootState {
  return {
    appContext: { organization_id: organizationId },
  } as unknown as RootState;
}

describe("workflow-runtime stream organization admission", () => {
  it("stamps the selected organization onto authed stream headers", () => {
    expect(
      stampRunStreamOrganizationContext(stateWithOrganization(ORGANIZATION_ID), {
        Authorization: "Bearer jwt-token",
        "Content-Type": "application/json",
      }),
    ).toEqual({
      Authorization: "Bearer jwt-token",
      "Content-Type": "application/json",
      "X-Organization-Id": ORGANIZATION_ID,
    });
  });

  it("omits the header (stream-lane posture, mirroring resolveBackendForConversation) when no organization is selected", () => {
    expect(
      stampRunStreamOrganizationContext(stateWithOrganization(null), {
        Authorization: "Bearer jwt-token",
      }),
    ).toEqual({ Authorization: "Bearer jwt-token" });
  });

  it("refuses a conflicting pre-set organization header instead of overriding it", () => {
    expect(() =>
      stampRunStreamOrganizationContext(stateWithOrganization(ORGANIZATION_ID), {
        "x-organization-id": "22222222-2222-4222-8222-222222222222",
      }),
    ).toThrow("must match the request context organization");
  });
});
