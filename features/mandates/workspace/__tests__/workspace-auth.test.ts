import { requireMandateWorkspaceUser } from "../useMandateWorkspaceData";

describe("mandate workspace authentication gate", () => {
  it("refuses when auth hydration has no user", async () => {
    const getUser = jest.fn().mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await expect(
      requireMandateWorkspaceUser({ auth: { getUser } } as never),
    ).rejects.toThrow("Opening a mandate requires an authenticated session.");
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("returns the authenticated identity", async () => {
    const getUser = jest.fn().mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    await expect(
      requireMandateWorkspaceUser({ auth: { getUser } } as never),
    ).resolves.toBe("user-123");
  });
});
