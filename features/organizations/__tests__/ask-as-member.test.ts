/**
 * A record shared from an organization she is not in must not ask that
 * organization's member-only doors (page-pass 2026-09-27, /crm/<id>: a 403 from
 * `platform.unified_data_store_on` on every load of the custom-fields section).
 *
 * An ARCHIVED organization is not one she is in either (2026-10-08): her
 * membership row is kept, but every member-only door refuses it — /education/kits
 * drew one 403 per archived organization (100 for the test admin) per load.
 */
const mockRows = jest.fn();
jest.mock("@/features/organizations/service/memberOrganizationRows", () => ({
  readMemberOrganizationRows: () => mockRows(),
}));

import { __resetOrganizationsIAmInForTest, askAsMember } from "@/features/organizations/organizationsIAmIn";

const MINE = "11111111-1111-4111-8111-111111111111";
const THEIRS = "22222222-2222-4222-8222-222222222222";
const ARCHIVED = "33333333-3333-4333-8333-333333333333";

const rows = (...r: Array<{ id: string; archived_at: string | null }>) => ({ ok: true, roleByOrgId: new Map(), rows: r });

describe("askAsMember", () => {
  beforeEach(() => {
    __resetOrganizationsIAmInForTest();
    mockRows.mockReset();
  });

  it("asks the door for an organization she is in", async () => {
    mockRows.mockResolvedValue(rows({ id: MINE, archived_at: null }));
    const ask = jest.fn().mockResolvedValue(true);
    await expect(askAsMember(MINE, ask, false)).resolves.toBe(true);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("answers OFF with NO request for an organization she is not in", async () => {
    mockRows.mockResolvedValue(rows({ id: MINE, archived_at: null }));
    const ask = jest.fn().mockResolvedValue(true);
    await expect(askAsMember(THEIRS, ask, false)).resolves.toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });

  it("answers OFF with NO request for an archived organization she still holds a membership row in", async () => {
    mockRows.mockResolvedValue(rows({ id: MINE, archived_at: null }, { id: ARCHIVED, archived_at: "2026-10-01T00:00:00Z" }));
    const ask = jest.fn().mockResolvedValue(true);
    await expect(askAsMember(ARCHIVED, ask, false)).resolves.toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });

  it("asks as before when her memberships could not be read", async () => {
    mockRows.mockResolvedValue({ ok: false, stage: "memberships", error: { message: "timeout" } });
    const ask = jest.fn().mockResolvedValue(true);
    await expect(askAsMember(THEIRS, ask, false)).resolves.toBe(true);
    expect(ask).toHaveBeenCalledTimes(1);
  });
});
