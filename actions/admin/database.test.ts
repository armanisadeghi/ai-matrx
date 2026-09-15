const requireSuperAdminDatabaseClient = jest.fn();

jest.mock(
  "@/features/administration/database-hub/require-super-admin-database-client",
  () => ({
    requireSuperAdminDatabaseClient: () => requireSuperAdminDatabaseClient(),
  }),
);

jest.mock("@/utils/supabase/adminClient", () => ({
  createAdminClient: jest.fn(() => {
    throw new Error("raw service-role client bypassed canonical gate");
  }),
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
    requireSuperAdminDatabaseClient.mockReset();
  });

  it("refuses a non-super-admin before creating the service-role client", async () => {
    requireSuperAdminDatabaseClient.mockRejectedValue(
      new Error("Forbidden: Super Admin required"),
    );

    await expect(executeSqlQuery("SELECT 1")).resolves.toEqual({
      data: null,
      error: "Failed to execute SQL query: Forbidden: Super Admin required",
    });
  });

  it("executes read-only SQL only after the super-admin check succeeds", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ one: 1 }],
      error: null,
    });
    requireSuperAdminDatabaseClient.mockResolvedValue({ rpc });

    await expect(executeSqlQuery("SELECT 1 AS one")).resolves.toEqual({
      data: [{ one: 1 }],
      error: null,
    });
    expect(requireSuperAdminDatabaseClient).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("execute_admin_query", {
      query: "SELECT 1 AS one",
    });
  });
});
