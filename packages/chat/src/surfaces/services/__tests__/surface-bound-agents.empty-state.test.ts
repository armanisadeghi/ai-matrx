const inQuery = jest.fn();

jest.mock("../../../host/db", () => ({
  supabase: {
    schema: () => ({
      from: () => ({
        select: () => ({ in: (...args: unknown[]) => inQuery(...args) }),
      }),
    }),
  },
}));

import { fetchSurfaceMenuAgentsGrouped } from "../surface-bound-agents.service";
import { configureServerForTest } from "../../../testing/server-test-host";

// Server calls reach the host's server client through the server port (P9).
beforeAll(() => {
  configureServerForTest({});
});


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
