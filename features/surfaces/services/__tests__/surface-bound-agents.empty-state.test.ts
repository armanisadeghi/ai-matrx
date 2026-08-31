const inQuery = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      from: () => ({
        select: () => ({ in: (...args: unknown[]) => inQuery(...args) }),
      }),
    }),
  },
}));

import { fetchSurfaceMenuAgentsGrouped } from "../surface-bound-agents.service";

describe("surface-bound agent empty state", () => {
  beforeEach(() => {
    inQuery.mockReset();
    inQuery.mockResolvedValue({ data: [], error: null });
  });

  it("treats a surface with no bound agents as an ordinary empty state", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      fetchSurfaceMenuAgentsGrouped(
        "matrx-user/education-fastfire",
        "user-1",
        { includeDefaults: false, force: true },
      ),
    ).resolves.toEqual([]);

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
