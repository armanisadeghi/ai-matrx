/**
 * overlayRenderWatchdog.test.ts — pure visibility diagnosis used by the
 * silent-render watchdog. No store/DOM/timers.
 */
import {
  diagnoseOverlayRender,
  rectOnScreen,
} from "@/features/window-panels/diagnostics/overlayRenderWatchdog";
import type { WindowEntry } from "@/lib/redux/slices/windowManagerSlice";

const VW = 1280;
const VH = 800;

const entry = (over: Partial<WindowEntry> = {}): WindowEntry => ({
  id: "w",
  title: "W",
  state: "windowed",
  windowed: { x: 100, y: 100, width: 400, height: 300 },
  preMinimizedRect: null,
  zIndex: 1000,
  traySlot: null,
  popoutMode: null,
  prePopoutRect: null,
  ...over,
});

describe("rectOnScreen", () => {
  it("true for a window inside the viewport", () => {
    expect(rectOnScreen({ x: 100, y: 100, width: 400, height: 300 }, VW, VH)).toBe(true);
  });
  it("false for a window pushed off the right/bottom edge", () => {
    expect(rectOnScreen({ x: 5000, y: 5000, width: 400, height: 300 }, VW, VH)).toBe(false);
  });
});

describe("diagnoseOverlayRender", () => {
  it("flags a missing window entry as no-window-registered", () => {
    expect(diagnoseOverlayRender({ entry: undefined, windowsHidden: false, viewportWidth: VW, viewportHeight: VH }))
      .toEqual({ ok: false, reason: "no-window-registered" });
  });

  it("flags the global hide-all", () => {
    expect(diagnoseOverlayRender({ entry: entry(), windowsHidden: true, viewportWidth: VW, viewportHeight: VH }))
      .toEqual({ ok: false, reason: "all-windows-hidden" });
  });

  it("treats a minimized window as ok (parked in the tray, not a failure)", () => {
    expect(diagnoseOverlayRender({ entry: entry({ state: "minimized" }), windowsHidden: false, viewportWidth: VW, viewportHeight: VH }))
      .toEqual({ ok: true, reason: null });
  });

  it("flags an off-screen window", () => {
    expect(diagnoseOverlayRender({ entry: entry({ windowed: { x: 5000, y: 5000, width: 400, height: 300 } }), windowsHidden: false, viewportWidth: VW, viewportHeight: VH }))
      .toEqual({ ok: false, reason: "off-screen" });
  });

  it("flags a zero-size window", () => {
    expect(diagnoseOverlayRender({ entry: entry({ windowed: { x: 100, y: 100, width: 0, height: 0 } }), windowsHidden: false, viewportWidth: VW, viewportHeight: VH }))
      .toEqual({ ok: false, reason: "zero-size" });
  });

  it("passes a healthy windowed panel", () => {
    expect(diagnoseOverlayRender({ entry: entry(), windowsHidden: false, viewportWidth: VW, viewportHeight: VH }))
      .toEqual({ ok: true, reason: null });
  });

  it("passes a maximized panel", () => {
    expect(diagnoseOverlayRender({ entry: entry({ state: "maximized" }), windowsHidden: false, viewportWidth: VW, viewportHeight: VH }))
      .toEqual({ ok: true, reason: null });
  });

  it("treats a popped-out window as ok (separate OS window)", () => {
    expect(diagnoseOverlayRender({ entry: entry({ popoutMode: "pip", windowed: { x: 5000, y: 5000, width: 0, height: 0 } }), windowsHidden: true, viewportWidth: VW, viewportHeight: VH }))
      .toEqual({ ok: true, reason: null });
  });
});
