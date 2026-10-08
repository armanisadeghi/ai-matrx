/**
 * A CALL ABOUT AN EXISTING RECORD CARRIES THE RECORD'S OWN ORGANIZATION (active-org law, rule 3;
 * AO-198). `fetchWithOrganization` sends the active organization for new work, and the
 * organization named per call for a record that already has one.
 */
const ACTIVE = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
const RECORDS = "57f2a22b-5875-46c6-80df-437076421c28";

jest.mock("@/lib/organizations/activeOrg", () => ({ getActiveOrgId: () => ACTIVE }));
// A write waits for the load ladder, then carries the active organization.
jest.mock("@/lib/organizations/ensureOrgId", () => ({ ensureOrgId: async () => ACTIVE }));

import { fetchWithOrganization } from "../fetchWithOrganization";

const sent: Array<string | null> = [];
beforeEach(() => {
  sent.length = 0;
  globalThis.fetch = jest.fn(async (_input: unknown, init?: RequestInit) => {
    sent.push(new Headers(init?.headers).get("X-Organization-Id"));
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
});

describe("fetchWithOrganization per-call organization", () => {
  it("new work rides the active organization", async () => {
    await fetchWithOrganization("/api/x", { method: "POST" });
    expect(sent).toEqual([ACTIVE]);
  });

  it("a call about an existing record rides THAT record's organization, not the active one", async () => {
    await fetchWithOrganization("/api/x", { method: "POST" }, { organizationId: RECORDS });
    expect(sent).toEqual([RECORDS]);
  });

  it("an absent per-call organization falls back to the active one", async () => {
    await fetchWithOrganization("/api/x", undefined, { organizationId: null });
    expect(sent).toEqual([ACTIVE]);
  });
});
