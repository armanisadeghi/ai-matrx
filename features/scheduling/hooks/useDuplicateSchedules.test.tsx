import { renderHook, settle } from "@/test-utils/renderHook";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { listDuplicateSchedules } from "../service/schedulerClient";
import { useDuplicateSchedules } from "./useDuplicateSchedules";

jest.mock("../service/schedulerClient", () => ({
  listDuplicateSchedules: jest.fn(),
}));

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: jest.fn(),
}));

const listDuplicatesMock = jest.mocked(listDuplicateSchedules);
const captureErrorMock = jest.mocked(captureError);

describe("useDuplicateSchedules", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps the roster usable while making a failed duplicate check loud", async () => {
    const failure = new Error("scheduler unavailable");
    listDuplicatesMock.mockRejectedValueOnce(failure);

    const hook = await renderHook(() => useDuplicateSchedules());

    await settle(
      hook,
      (value) => value.error === "Couldn't check for duplicate schedules.",
      "the duplicate failure warning",
    );

    expect(hook.current.groups).toEqual([]);
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "runtime-exception",
        operation: "select",
        relation: "scheduler/tasks/duplicates",
        recoverable: true,
        raw: failure,
      }),
    );
    await hook.unmount();
  });

  it("clears the warning after a successful retry", async () => {
    listDuplicatesMock
      .mockRejectedValueOnce(new Error("temporary outage"))
      .mockResolvedValueOnce({ groups: [] });

    const hook = await renderHook(() => useDuplicateSchedules());
    await settle(hook, (value) => value.error !== null, "the first failure");

    await hook.act(() => hook.current.refetch());

    await settle(hook, (value) => value.error === null, "the successful retry");
    expect(listDuplicatesMock).toHaveBeenCalledTimes(2);
    await hook.unmount();
  });
});
