import { configureStore } from "@reduxjs/toolkit";
import overlays, { openOverlay } from "@/lib/redux/slices/overlaySlice";
import windowManager from "@/lib/redux/slices/windowManagerSlice";
import { overlayRenderWatchdogMiddleware } from "../diagnostics/overlayRenderWatchdog";

jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), dismiss: jest.fn() } }));

it("records measured viewport and an honest missing acknowledgement on no-mount failure", () => {
  jest.useFakeTimers();
  const originalWidth = window.innerWidth;
  const originalHeight = window.innerHeight;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 812 });
  const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    const store = configureStore({
      reducer: { overlays, windowManager },
      middleware: (defaults) => defaults().concat(overlayRenderWatchdogMiddleware),
    });
    store.dispatch(openOverlay({ overlayId: "userPreferencesWindow" }));
    jest.advanceTimersByTime(48_000);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("no-window-registered"),
      expect.objectContaining({
        overlayId: "userPreferencesWindow",
        viewportWidth: 375,
        viewportHeight: 812,
        renderAcknowledgement: "none",
      }),
    );
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
    error.mockRestore();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
  }
});
