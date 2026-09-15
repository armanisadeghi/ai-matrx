const requireSuperAdmin = jest.fn<Promise<string>, []>();
const createAdminClient = jest.fn();

jest.mock("@/utils/auth/adminUtils", () => ({
  requireSuperAdmin: () => requireSuperAdmin(),
}));

jest.mock("@/utils/supabase/adminClient", () => ({
  createAdminClient: () => createAdminClient(),
}));

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

import { executeSqlQuery } from "./database";

describe("executeSqlQuery authorization boundary", () => {
  beforeEach(() => {
    requireSuperAdmin.mockReset();
    createAdminClient.mockReset();
  });

  it("refuses a non-super-admin before creating the service-role client", async () => {
    requireSuperAdmin.mockRejectedValue(
      new Error("Forbidden: Super Admin required"),
    );

    await expect(executeSqlQuery("SELECT 1")).resolves.toEqual({
      data: null,
      error: "Failed to execute SQL query: Forbidden: Super Admin required",
    });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("executes read-only SQL only after the super-admin check succeeds", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ one: 1 }],
      error: null,
    });
    requireSuperAdmin.mockResolvedValue("admin-user-id");
    createAdminClient.mockReturnValue({ rpc });

    await expect(executeSqlQuery("SELECT 1 AS one")).resolves.toEqual({
      data: [{ one: 1 }],
      error: null,
    });
    expect(requireSuperAdmin).toHaveBeenCalledTimes(1);
    expect(createAdminClient).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("execute_admin_query", {
      query: "SELECT 1 AS one",
    });
  });
});
