/**
 * A record shared from an organization she is not in must not ask that
 * organization's member-only doors (page-pass 2026-09-27, /crm/<id>: a 403 from
 * `platform.unified_data_store_on` on every load of the custom-fields section).
 */
const mockForUser = jest.fn();
jest.mock("@/features/organizations/service/membershipsService", () => ({
  membershipsService: { forUser: (...a: unknown[]) => mockForUser(...a) },
}));
jest.mock("@/features/scopes/types", () => ({
  isScopesRpcErr: (r: { error?: unknown }) => Boolean(r && (r as { error?: unknown }).error),
}));

import { __resetOrganizationsIAmInForTest, askAsMember } from "@/features/organizations/organizationsIAmIn";

const MINE = "11111111-1111-4111-8111-111111111111";
const THEIRS = "22222222-2222-4222-8222-222222222222";

describe("askAsMember", () => {
  beforeEach(() => {
    __resetOrganizationsIAmInForTest();
    mockForUser.mockReset();
  });

  it("asks the door for an organization she is in", async () => {
    mockForUser.mockResolvedValue({ data: { memberships: [{ containerId: MINE }] } });
    const ask = jest.fn().mockResolvedValue(true);
    await expect(askAsMember(MINE, ask, false)).resolves.toBe(true);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("answers OFF with NO request for an organization she is not in", async () => {
    mockForUser.mockResolvedValue({ data: { memberships: [{ containerId: MINE }] } });
    const ask = jest.fn().mockResolvedValue(true);
    await expect(askAsMember(THEIRS, ask, false)).resolves.toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });

  it("asks as before when her memberships could not be read", async () => {
    mockForUser.mockResolvedValue({ error: { message: "timeout" } });
    const ask = jest.fn().mockResolvedValue(true);
    await expect(askAsMember(THEIRS, ask, false)).resolves.toBe(true);
    expect(ask).toHaveBeenCalledTimes(1);
  });
});
