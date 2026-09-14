import { renderHook, settle } from "@/test-utils/renderHook";
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
    expect(fetchRunsForTaskThunk).toHaveBeenCalledWith("task-1", 20);

    hook.current.retry();
    await settle(
      hook,
      () => dispatchMock.mock.calls.length === 2,
      "manual retry fetch",
    );
    await hook.unmount();
  });
});
