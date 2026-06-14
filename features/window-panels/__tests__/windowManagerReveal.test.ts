/**
 * windowManagerReveal.test.ts
 *
 * Covers the silent-render hardening added to windowManagerSlice:
 *  - registerWindow clears a stale global hide-all (a new window is always shown)
 *  - unregisterWindow resets windowsHidden once the last window closes
 *  - revealWindow brings a minimized / off-screen / hidden window back into view
 */
import reducer, {
  registerWindow,
  unregisterWindow,
  minimizeWindow,
  toggleWindowsHidden,
  revealWindow,
  type WindowRect,
} from "@/lib/redux/slices/windowManagerSlice";

const VW = 1280;
const VH = 800;
const rect = (over: Partial<WindowRect> = {}): WindowRect => ({
  x: 100,
  y: 100,
  width: 400,
  height: 300,
  ...over,
});

const init = () => reducer(undefined, { type: "@@INIT" });

describe("windowManagerSlice — silent-render hardening", () => {
  describe("registerWindow", () => {
    it("clears a stranded windowsHidden when a new window opens", () => {
      let s = init();
      s = reducer(s, registerWindow({ id: "a", initial: rect() }));
      s = reducer(s, toggleWindowsHidden()); // hide all
      expect(s.windowsHidden).toBe(true);

      // Opening a brand-new window must never be silently suppressed.
      s = reducer(s, registerWindow({ id: "b", initial: rect() }));
      expect(s.windowsHidden).toBe(false);
    });

    it("is still idempotent for an existing id", () => {
      let s = init();
      s = reducer(s, registerWindow({ id: "a", initial: rect({ x: 5 }) }));
      const z = s.windows["a"].zIndex;
      s = reducer(s, registerWindow({ id: "a", initial: rect({ x: 999 }) }));
      expect(s.windows["a"].windowed.x).toBe(5); // unchanged
      expect(s.windows["a"].zIndex).toBe(z);
    });
  });

  describe("unregisterWindow", () => {
    it("resets windowsHidden when the last window is removed", () => {
      let s = init();
      s = reducer(s, registerWindow({ id: "a", initial: rect() }));
      s = reducer(s, toggleWindowsHidden());
      expect(s.windowsHidden).toBe(true);

      s = reducer(s, unregisterWindow("a"));
      expect(Object.keys(s.windows)).toHaveLength(0);
      // Flag can't outlive the windows it governs (would hide the next open).
      expect(s.windowsHidden).toBe(false);
    });

    it("leaves windowsHidden alone while other windows remain", () => {
      let s = init();
      s = reducer(s, registerWindow({ id: "a", initial: rect() }));
      s = reducer(s, registerWindow({ id: "b", initial: rect() }));
      // registerWindow cleared the flag; re-hide to assert unregister behaviour.
      s = reducer(s, toggleWindowsHidden());
      s = reducer(s, unregisterWindow("a"));
      expect(s.windowsHidden).toBe(true);
    });
  });

  describe("revealWindow", () => {
    it("no-ops for an unregistered id", () => {
      const s = init();
      const next = reducer(
        s,
        revealWindow({ id: "ghost", viewportWidth: VW, viewportHeight: VH }),
      );
      expect(next.windows["ghost"]).toBeUndefined();
    });

    it("restores a minimized window and clears hide-all", () => {
      let s = init();
      s = reducer(s, registerWindow({ id: "a", initial: rect() }));
      s = reducer(
        s,
        minimizeWindow({ id: "a", viewportWidth: VW, viewportHeight: VH }),
      );
      s = reducer(s, toggleWindowsHidden());
      expect(s.windows["a"].state).toBe("minimized");
      expect(s.windowsHidden).toBe(true);

      s = reducer(
        s,
        revealWindow({ id: "a", viewportWidth: VW, viewportHeight: VH }),
      );
      expect(s.windows["a"].state).toBe("windowed");
      expect(s.windows["a"].windowed.width).toBe(400); // pre-minimized rect
      expect(s.windowsHidden).toBe(false);
    });

    it("clamps an off-screen window back into the viewport and raises it", () => {
      let s = init();
      s = reducer(
        s,
        registerWindow({
          id: "a",
          initial: rect({ x: 5000, y: 5000, width: 400, height: 300 }),
        }),
      );
      s = reducer(s, registerWindow({ id: "b", initial: rect() }));
      const before = s.windows["a"].zIndex;

      s = reducer(
        s,
        revealWindow({ id: "a", viewportWidth: VW, viewportHeight: VH }),
      );
      const r = s.windows["a"].windowed;
      expect(r.x).toBeLessThan(VW);
      expect(r.y).toBeLessThan(VH);
      expect(s.windows["a"].zIndex).toBeGreaterThan(before);
    });
  });
});
