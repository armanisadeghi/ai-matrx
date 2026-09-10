import { renderHook } from "@/test-utils/renderHook";

const mockUseMasterworkRun = jest.fn();

jest.mock("../durable-run/useMasterworkRun", () => ({
  useMasterworkRun: (...args: unknown[]) => mockUseMasterworkRun(...args),
}));

import { useBuildRun } from "./useBuildRun";

describe("useBuildRun", () => {
  beforeEach(() => {
    mockUseMasterworkRun.mockReset();
  });

  it("keeps the launched Masterwork name when a running build rejoins", async () => {
    mockUseMasterworkRun.mockReturnValue({
      status: "rejoining",
      running: true,
      error: null,
      result: null,
      rejoinedTarget: "Agent Review 18:30 — Strunk Masterwork",
      launch: jest.fn(),
      reset: jest.fn(),
    });

    const hook = await renderHook(() =>
      useBuildRun(
        "e492a07f-a1d4-4a4b-98e7-bc929a0f40fd",
        "The Elements of Style — the Strunk Canon Masterwork",
      ),
    );

    expect(hook.current.progress?.title).toBe(
      "Agent Review 18:30 — Strunk Masterwork",
    );
    await hook.unmount();
  });
});
