const from = jest.fn();
const addMembership = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: {},
}));

jest.mock("@/utils/supabase/workspaceDb", () => ({
  workspaceDb: () => ({ from }),
}));

jest.mock("@/utils/auth/getUserId", () => ({
  requireUserId: () => "00000000-0000-4000-8000-000000000001",
}));

jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: (organizationId: string) => Promise.resolve(organizationId),
}));

jest.mock("@/features/organizations/service/membershipsService", () => ({
  membershipsService: { add: addMembership },
}));

jest.mock("@/features/organizations/service/invitationsService", () => ({
  invitationsService: {},
}));

import { createProject, isProjectSlugAvailable } from "./service";

describe("project creation", () => {
  beforeEach(() => {
    from.mockReset();
    addMembership.mockReset();
  });

  it("relies on the project insert trigger to bootstrap the owner membership", async () => {
    const availabilityQuery: Record<string, jest.Mock> = {};
    for (const method of ["select", "is", "eq", "limit"]) {
      availabilityQuery[method] = jest.fn(() => availabilityQuery);
    }
    availabilityQuery.maybeSingle = jest.fn().mockResolvedValue({
      data: null,
      error: null,
    });

    const projectRow = {
      id: "00000000-0000-4000-8000-000000000002",
      name: "New project",
      slug: "new-project",
      description: null,
      organization_id: "00000000-0000-4000-8000-000000000003",
      created_by: "00000000-0000-4000-8000-000000000001",
      settings: {},
      status: "active",
      priority: null,
      start_date: null,
      target_date: null,
      created_at: "2026-07-21T09:26:33.438Z",
      updated_at: "2026-07-21T09:26:33.438Z",
    };
    const insertQuery: Record<string, jest.Mock> = {};
    insertQuery.insert = jest.fn(() => insertQuery);
    insertQuery.select = jest.fn(() => insertQuery);
    insertQuery.single = jest.fn().mockResolvedValue({
      data: projectRow,
      error: null,
    });

    from
      .mockReturnValueOnce(availabilityQuery)
      .mockReturnValueOnce(insertQuery);

    await expect(
      createProject({
        name: "New project",
        slug: "new-project",
        organizationId: projectRow.organization_id,
      }),
    ).resolves.toMatchObject({
      success: true,
      project: { id: projectRow.id },
    });

    expect(addMembership).not.toHaveBeenCalled();
  });
});

describe("isProjectSlugAvailable", () => {
  beforeEach(() => {
    from.mockReset();
  });

  it("treats an expected zero-row lookup as an available slug", async () => {
    const query: Record<string, jest.Mock> = {};
    for (const method of ["select", "is", "eq", "limit"]) {
      query[method] = jest.fn(() => query);
    }
    query.maybeSingle = jest.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    from.mockReturnValue(query);

    await expect(
      isProjectSlugAvailable(
        "available-slug",
        "00000000-0000-4000-8000-000000000003",
      ),
    ).resolves.toBe(true);
    expect(query.limit).toHaveBeenCalledWith(1);
    expect(query.maybeSingle).toHaveBeenCalledTimes(1);
  });

  // Still fails closed — but as a THROWN failure, never as "taken" (RC-B12
  // r13): createProject turns it into its own refusal with the real reason,
  // and the availability hook shows "unknown" instead of "already exists".
  it("fails closed when the availability query errors", async () => {
    const query: Record<string, jest.Mock> = {};
    for (const method of ["select", "is", "eq", "limit"]) {
      query[method] = jest.fn(() => query);
    }
    query.maybeSingle = jest.fn().mockResolvedValue({
      data: null,
      error: { message: "database unavailable" },
    });
    from.mockReturnValue(query);
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      isProjectSlugAvailable(
        "unknown-slug",
        "00000000-0000-4000-8000-000000000003",
      ),
    ).rejects.toThrow("database unavailable");
    expect(consoleError).toHaveBeenCalledWith(
      "Error checking project slug availability:",
      expect.anything(),
    );

    consoleError.mockRestore();
  });
});
