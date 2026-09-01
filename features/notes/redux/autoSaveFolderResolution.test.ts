const maybeSingle = jest.fn();

const query = {
  select: jest.fn(),
  eq: jest.fn(),
  is: jest.fn(),
  limit: jest.fn(),
  maybeSingle,
};

for (const method of ["select", "eq", "is", "limit"] as const) {
  query[method].mockReturnValue(query);
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: jest.fn(() => ({ from: jest.fn(() => query) })),
  },
}));

jest.mock("server-only", () => ({}));

import { resolveMaterializedFolderId } from "./autoSaveMiddleware";

describe("resolveMaterializedFolderId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const method of ["select", "eq", "is", "limit"] as const) {
      query[method].mockReturnValue(query);
    }
  });

  it("treats an absent optional folder row as a null folder id", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(
      resolveMaterializedFolderId("user-1", "Draft"),
    ).resolves.toBeNull();
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("returns the matching materialized folder id", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "folder-1" }, error: null });

    await expect(
      resolveMaterializedFolderId("user-1", "Projects"),
    ).resolves.toBe("folder-1");
  });

  it("does not swallow real query failures", async () => {
    const failure = new Error("folder lookup failed");
    maybeSingle.mockResolvedValue({ data: null, error: failure });

    await expect(
      resolveMaterializedFolderId("user-1", "Draft"),
    ).rejects.toBe(failure);
  });
});
