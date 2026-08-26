const mockRpc = jest.fn();
const mockGetSession = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    rpc: mockRpc,
    auth: { getSession: mockGetSession },
  },
}));

jest.mock("@/utils/auth/getUserId", () => ({
  requireUserId: jest.fn(() => "user-1"),
}));

import { membershipsService } from "../service/membershipsService";

const MEMBERSHIP_ROW = {
  id: "membership-1",
  organization_id: "organization-1",
  container_id: "organization-1",
  user_id: "user-1",
  role: "owner",
  status: "active",
  created_at: "2026-08-25T00:00:00.000Z",
};

describe("membership read session boundary", () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("recovers one anonymous 401 and repeats the idempotent read once", async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: "42501",
          message: "permission denied for function mbr_for_user",
        },
        status: 401,
      })
      .mockResolvedValueOnce({
        data: [MEMBERSHIP_ROW],
        error: null,
        status: 200,
      });
    mockGetSession
      .mockResolvedValueOnce({
        data: { session: { access_token: "initial-token" } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { session: { access_token: "recovered-token" } },
        error: null,
      });

    const result = await membershipsService.forUser("organization");

    expect(result).toEqual({
      ok: true,
      data: {
        memberships: [
          {
            id: "membership-1",
            organizationId: "organization-1",
            containerId: "organization-1",
            userId: "user-1",
            role: "owner",
            status: "active",
            createdAt: "2026-08-25T00:00:00.000Z",
          },
        ],
      },
    });
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockGetSession).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("recovery firing"),
    );
  });

  it("does not retry an authenticated 403 execute-grant defect", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "authenticated-token" } },
      error: null,
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "permission denied for function mbr_for_user",
      },
      status: 403,
    });

    const result = await membershipsService.forUser("organization");

    expect(result).toMatchObject({
      ok: false,
      error: { code: "forbidden_org", message: "Permission denied" },
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it("does not call the membership RPC after the browser session is gone", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    const result = await membershipsService.forUser("organization");

    expect(result).toMatchObject({
      ok: false,
      error: { code: "unauthorized", message: "Your session expired" },
    });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
