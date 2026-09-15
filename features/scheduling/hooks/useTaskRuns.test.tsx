import { renderHook, settle } from "@/test-utils/renderHook";
import { useState } from "react";
import { fetchRunsForTaskThunk } from "../redux/runs/thunks";
import { useTaskRuns } from "./useTaskRuns";

const dispatchMock = jest.fn();
let status: "idle" | "loading" | "success" | "error" = "idle";
let error: string | null = null;

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: (selector: () => unknown) => selector(),
}));

jest.mock("../redux/runs/selectors", () => ({
  selectRunsForTask: () => [],
  selectRunsFetchStatus: () => status,
  selectRunsFetchError: () => error,
}));

jest.mock("../redux/runs/thunks", () => ({
  fetchRunsForTaskThunk: jest.fn((taskId: string, limit: number) => ({
    taskId,
    limit,
  })),
}));

describe("useTaskRuns", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dispatchMock.mockResolvedValue(undefined);
    status = "idle";
    error = null;
  });

  it("starts once and offers an explicit retry after a terminal error", async () => {
    const hook = await renderHook(() => useTaskRuns("task-1"));
    await settle(
      hook,
      () => dispatchMock.mock.calls.length === 1,
      "initial run fetch",
    );
    expect(fetchRunsForTaskThunk).toHaveBeenCalledWith("task-1", 20, []);

    hook.current.retry();
    await settle(
      hook,
      () => dispatchMock.mock.calls.length === 2,
      "manual retry fetch",
    );
    await hook.unmount();
  });

  it("refetches a historical run that is absent from the cached recent page", async () => {
    status = "success";
    const historicalRunId = "78c5de02-545e-45b3-9ab9-85f05525c433";

    const hook = await renderHook(() =>
      useTaskRuns("task-1", 20, [historicalRunId]),
    );
    await settle(
      hook,
      () => dispatchMock.mock.calls.length === 1,
      "required historical run fetch",
    );

    expect(fetchRunsForTaskThunk).toHaveBeenCalledWith("task-1", 20, [
      historicalRunId,
    ]);
    await settle(
      hook,
      (value) => value.requiredRunsSettled,
      "required historical run settlement",
    );
    await hook.unmount();
  });

  it("does not automatically repeat a terminal error or a missing-run result", async () => {
    function useHarness() {
      const [, setRender] = useState(0);
      const value = useTaskRuns("task-1", 20, ["missing-run"]);
      return { ...value, render: () => setRender((current) => current + 1) };
    }
    const hook = await renderHook(useHarness);
    await settle(
      hook,
      () => dispatchMock.mock.calls.length === 1,
      "initial request",
    );

    status = "error";
    await hook.act(() => hook.current.render());
    status = "success";
    await hook.act(() => hook.current.render());

    expect(dispatchMock).toHaveBeenCalledTimes(1);
    await hook.unmount();
  });
});
