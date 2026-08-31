import { renderHook, settle } from "@/test-utils/renderHook";
import { fetchScheduledTask } from "../redux/tasks/thunks";
import { useTaskDetail } from "./useTaskDetail";

const dispatchMock = jest.fn();
let selectedTask: { id: string } | null = null;

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: () => selectedTask,
}));

jest.mock("../redux/tasks/thunks", () => ({
  fetchScheduledTask: jest.fn((taskId: string) => ({ taskId })),
}));

describe("useTaskDetail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    selectedTask = null;
  });

  it("derives idle and loaded states without effect-driven state repair", async () => {
    const idle = await renderHook(() => useTaskDetail(null));
    expect(idle.current).toEqual({ task: null, status: "idle", error: null });
    expect(dispatchMock).not.toHaveBeenCalled();
    await idle.unmount();

    selectedTask = { id: "task-1" };
    const loaded = await renderHook(() => useTaskDetail("task-1"));
    expect(loaded.current).toEqual({
      task: selectedTask,
      status: "success",
      error: null,
    });
    expect(dispatchMock).not.toHaveBeenCalled();
    await loaded.unmount();
  });

  it("reports a completed missing-task fetch as not found", async () => {
    dispatchMock.mockResolvedValue(false);
    const hook = await renderHook(() => useTaskDetail("missing"));

    expect(fetchScheduledTask).toHaveBeenCalledWith("missing");
    await settle(hook, (value) => value.status === "not-found", "not found");
    expect(hook.current.error).toBeNull();
    await hook.unmount();
  });

  it("keeps transport failures loud", async () => {
    dispatchMock.mockRejectedValue(new Error("scheduler unavailable"));
    const hook = await renderHook(() => useTaskDetail("task-2"));

    await settle(hook, (value) => value.status === "error", "fetch failure");
    expect(hook.current.error).toBe("scheduler unavailable");
    await hook.unmount();
  });
});
