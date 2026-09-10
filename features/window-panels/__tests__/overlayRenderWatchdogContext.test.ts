import { configureStore } from "@reduxjs/toolkit";
import overlays, { openOverlay } from "@/lib/redux/slices/overlaySlice";
import windowManager from "@/lib/redux/slices/windowManagerSlice";
import { overlayRenderWatchdogMiddleware } from "../diagnostics/overlayRenderWatchdog";

jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), dismiss: jest.fn() } }));

it.each([
  [375, 812, 375, 812, false],
  [0, 0, 1280, 800, true],
])("records viewport %s x %s and its fallback state on no-mount failure", (width, height, expectedWidth, expectedHeight, degenerate) => {
  jest.useFakeTimers();
  const originalWidth = window.innerWidth;
  const originalHeight = window.innerHeight;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
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
        viewportWidth: expectedWidth,
        viewportHeight: expectedHeight,
        viewportDegenerate: degenerate,
        renderAcknowledgement: "none",
      }),
    );
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
    error.mockRestore();
    warn.mockRestore();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
  }
});
