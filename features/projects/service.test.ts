const from = jest.fn();
const addMembership = jest.fn();
const mockReadAllRows = jest.fn();
const forUser = jest.fn();
const counts = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: {},
}));

jest.mock("@/utils/supabase/projectsDb", () => ({
  projectsDb: () => ({ from }),
}));

jest.mock("@ai-matrx/data/db", () => ({ readAllRows: mockReadAllRows }));

jest.mock("@/utils/auth/getUserId", () => ({
  requireUserId: () => "00000000-0000-4000-8000-000000000001",
}));

jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: (organizationId: string) => Promise.resolve(organizationId),
}));

jest.mock("@/features/organizations/service/membershipsService", () => ({
  membershipsService: { add: addMembership, forUser, counts },
}));

jest.mock("@/features/organizations/service/invitationsService", () => ({
  invitationsService: {},
}));

import {
  createProject,
  getUserProjects,
  isProjectSlugAvailable,
} from "./service";

const PROVIDER_ACCESS_LAUNCH = {
  id: "042f5378-e46e-4d59-be7b-54664e3016bb",
  name: "Provider Access Launch",
  slug: "provider-access-launch",
  description: "Coordinate provider access work.",
  organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
  created_by: "c4e9c42d-3af4-4d76-92ef-1082b19a8bbb",
  settings: {},
  status: "active",
  priority: null,
  start_date: null,
  target_date: null,
  created_at: "2026-10-01T09:00:00.000Z",
  updated_at: "2026-10-02T09:00:00.000Z",
  deleted_at: null,
};

function readableProjectsQuery() {
  const query: Record<string, jest.Mock> = {};
  for (const method of ["select", "is", "order", "range"]) {
    query[method] = jest.fn(() => query);
  }
  return query;
}

describe("project creation", () => {
  beforeEach(() => {
    from.mockReset();
    addMembership.mockReset();
    mockReadAllRows.mockReset();
    forUser.mockReset();
    counts.mockReset();
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

describe("getUserProjects", () => {
  beforeEach(() => {
    from.mockReset();
    mockReadAllRows.mockReset();
    forUser.mockReset();
    counts.mockReset();
    forUser.mockResolvedValue({ ok: true, data: { memberships: [] } });
    counts.mockResolvedValue({
      ok: true,
      data: {
        counts: [
          {
            containerId: PROVIDER_ACCESS_LAUNCH.id,
            memberCount: 7,
          },
        ],
      },
    });
  });

  it("includes an RLS-readable organization project when the viewer has no direct project membership", async () => {
    const query = readableProjectsQuery();
    from.mockReturnValue(query);
    mockReadAllRows.mockImplementation(async (factory) => {
      await factory({ from: 0, to: 499 });
      return [PROVIDER_ACCESS_LAUNCH];
    });

    await expect(getUserProjects()).resolves.toEqual([
      expect.objectContaining({
        id: PROVIDER_ACCESS_LAUNCH.id,
        name: "Provider Access Launch",
        organizationId: PROVIDER_ACCESS_LAUNCH.organization_id,
        role: "member",
        memberCount: 7,
      }),
    ]);

    expect(forUser).toHaveBeenCalledWith("project");
    expect(counts).toHaveBeenCalledWith("project", [PROVIDER_ACCESS_LAUNCH.id]);
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
    expect(query.order).toHaveBeenNthCalledWith(1, "updated_at", {
      ascending: false,
    });
    expect(query.order).toHaveBeenNthCalledWith(2, "id", { ascending: true });
    expect(query.range).toHaveBeenCalledWith(0, 499);
  });

  it("rejects when the complete RLS project read fails instead of reporting no projects", async () => {
    mockReadAllRows.mockRejectedValue(new Error("project read unavailable"));

    await expect(getUserProjects()).rejects.toThrow("project read unavailable");
  });
});
