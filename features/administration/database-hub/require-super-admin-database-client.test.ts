const requireSuperAdmin = jest.fn<Promise<string>, []>();
const createAdminClient = jest.fn();

jest.mock("server-only", () => ({}));

jest.mock("@/utils/auth/adminUtils", () => ({
  requireSuperAdmin: () => requireSuperAdmin(),
}));

jest.mock("@/utils/supabase/adminClient", () => ({
  createAdminClient: () => createAdminClient(),
}));

import { requireSuperAdminDatabaseClient } from "./require-super-admin-database-client";

describe("requireSuperAdminDatabaseClient", () => {
  beforeEach(() => {
    requireSuperAdmin.mockReset();
    createAdminClient.mockReset();
  });

  it("refuses before creating a service-role client", async () => {
    requireSuperAdmin.mockRejectedValue(
      new Error("Forbidden: Super Admin required"),
    );

    await expect(requireSuperAdminDatabaseClient()).rejects.toThrow(
      "Forbidden: Super Admin required",
    );
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("returns the service-role client only after the super-admin check", async () => {
    const client = { rpc: jest.fn() };
    requireSuperAdmin.mockResolvedValue("admin-user-id");
    createAdminClient.mockReturnValue(client);

    await expect(requireSuperAdminDatabaseClient()).resolves.toBe(client);
    expect(requireSuperAdmin).toHaveBeenCalledTimes(1);
    expect(createAdminClient).toHaveBeenCalledTimes(1);
    expect(requireSuperAdmin.mock.invocationCallOrder[0]).toBeLessThan(
      createAdminClient.mock.invocationCallOrder[0],
    );
  });
});
