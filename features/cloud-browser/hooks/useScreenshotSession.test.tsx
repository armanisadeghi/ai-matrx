import { BackendApiError } from "@/lib/api/errors";
import { renderHook, settle } from "@/test-utils/renderHook";

const requestScreenshot = jest.fn();
const actions: Array<{ type: string }> = [];
const state = {
  cloudBrowser: {
    screenshot: { active: false, autoOffAt: null, frames: [] },
    browserActivityAt: null,
  },
};

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => (action: { type: string }) => {
    actions.push(action);
  },
  useAppSelector: (selector: (value: unknown) => unknown) => selector(state),
}));

jest.mock("../service", () => ({
  requestScreenshot: (...args: unknown[]) => requestScreenshot(...args),
}));

import { useScreenshotSession } from "./useScreenshotSession";

describe("useScreenshotSession", () => {
  beforeEach(() => {
    actions.length = 0;
    requestScreenshot.mockReset();
  });

  it("owns a failed capture promise and stops the bounded session", async () => {
    requestScreenshot.mockRejectedValue(new TypeError("Failed to fetch"));
    const hook = await renderHook(() => useScreenshotSession("run-1"));

    await hook.act(() => hook.current.start());
    await settle(
      hook,
      () =>
        actions.some((action) => action.type.endsWith("stopScreenshotSession")),
      "the screenshot session to stop",
    );

    expect(requestScreenshot).toHaveBeenCalledTimes(1);
    await hook.unmount();
  });

  it("keeps a retryable worker replacement re-armable without rethrowing", async () => {
    requestScreenshot.mockRejectedValue(
      new BackendApiError({
        code: "worker_unreachable",
        detail: "worker heartbeat timed out",
        userMessage: "The browser worker is restarting.",
        details: { retryable: true },
        status: 503,
      }),
    );
    const hook = await renderHook(() => useScreenshotSession("run-1"));

    await hook.act(() => hook.current.start());
    await settle(hook, () => requestScreenshot.mock.calls.length === 1);

    expect(
      actions.some((action) => action.type.endsWith("stopScreenshotSession")),
    ).toBe(false);
    await hook.unmount();
  });
});
