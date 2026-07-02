/**
 * popoutReducer.test.ts — Phase 1 reducer behavior for the Document
 * Picture-in-Picture popout feature.
 *
 * Covers:
 *  - popOutWindow / dockWindow state transitions
 *  - prePopoutRect save/restore round-trip
 *  - activePipWindowId single-slot enforcement
 *  - setPopoutCandidate flag toggle
 *  - unregisterWindow clears popout slot/candidate
 *  - minimizeWindow / minimizeAll skip popped-out windows
 *  - arrangeActiveWindows skips popped-out windows
 *  - restoreWindowState coerces popoutMode to null
 */
import reducer, {
  registerWindow,
  unregisterWindow,
  popOutWindow,
  dockWindow,
  setPopoutCandidate,
  minimizeWindow,
  minimizeAll,
  arrangeActiveWindows,
  restoreWindowState,
  updateWindowRect,
  type WindowEntry,
  type WindowManagerState,
  type WindowRect,
} from "@/lib/redux/slices/windowManagerSlice";
import { centerRectInViewport } from "@/features/window-panels/utils/rectClamp";

const RECT_A: WindowRect = { x: 100, y: 100, width: 400, height: 300 };
const RECT_B: WindowRect = { x: 200, y: 200, width: 500, height: 350 };
const VIEWPORT = { viewportWidth: 1920, viewportHeight: 1080 };

const dock = (state: WindowManagerState, id: string) =>
  reducer(state, dockWindow({ id, ...VIEWPORT }));

const fresh = (): WindowManagerState => reducer(undefined, { type: "@@INIT" });

const withRegistered = (
  ids: Array<{ id: string; rect: WindowRect; title?: string }>,
): WindowManagerState => {
  let state = fresh();
  for (const { id, rect, title } of ids) {
    state = reducer(state, registerWindow({ id, title, initial: rect }));
  }
  return state;
};

describe("windowManagerSlice — popout", () => {
  describe("registerWindow", () => {
    it("initializes new windows with popoutMode=null and prePopoutRect=null", () => {
      const state = withRegistered([{ id: "w1", rect: RECT_A }]);
      expect(state.windows.w1.popoutMode).toBeNull();
      expect(state.windows.w1.prePopoutRect).toBeNull();
    });
  });

  describe("popOutWindow", () => {
    it("sets popoutMode and saves prePopoutRect from current windowed rect", () => {
      let state = withRegistered([{ id: "w1", rect: RECT_A }]);
      state = reducer(state, popOutWindow({ id: "w1", mode: "pip" }));
      expect(state.windows.w1.popoutMode).toBe("pip");
      expect(state.windows.w1.prePopoutRect).toEqual(RECT_A);
    });

    it("claims the activePipWindowId slot for mode=pip", () => {
      let state = withRegistered([{ id: "w1", rect: RECT_A }]);
      state = reducer(state, popOutWindow({ id: "w1", mode: "pip" }));
      expect(state.activePipWindowId).toBe("w1");
    });

    it("does NOT claim the activePipWindowId slot for mode=popup", () => {
      let state = withRegistered([{ id: "w1", rect: RECT_A }]);
      state = reducer(state, popOutWindow({ id: "w1", mode: "popup" }));
      expect(state.windows.w1.popoutMode).toBe("popup");
      expect(state.activePipWindowId).toBeNull();
    });

    it("refuses pip when slot is held by a different window (defense-in-depth)", () => {
      let state = withRegistered([
        { id: "w1", rect: RECT_A },
        { id: "w2", rect: RECT_B },
      ]);
      state = reducer(state, popOutWindow({ id: "w1", mode: "pip" }));
      // Try to pop out w2 while w1 holds the slot
      state = reducer(state, popOutWindow({ id: "w2", mode: "pip" }));
      expect(state.windows.w2.popoutMode).toBeNull();
      expect(state.windows.w2.prePopoutRect).toBeNull();
      expect(state.activePipWindowId).toBe("w1");
    });

    it("allows mode=popup when another window holds the pip slot (multi-popout coexistence)", () => {
      let state = withRegistered([
        { id: "w1", rect: RECT_A },
        { id: "w2", rect: RECT_B },
      ]);
      // w1 pops out as PiP, claiming the slot
      state = reducer(state, popOutWindow({ id: "w1", mode: "pip" }));
      // w2 pops out as POPUP — should succeed, since popups don't claim the slot
      state = reducer(state, popOutWindow({ id: "w2", mode: "popup" }));
      // Both windows are popped out simultaneously
      expect(state.windows.w1.popoutMode).toBe("pip");
      expect(state.windows.w2.popoutMode).toBe("popup");
      // PiP slot still belongs to w1 — popup mode doesn't disturb it
      expect(state.activePipWindowId).toBe("w1");
      // w2 saved its prePopoutRect for dock-back
      expect(state.windows.w2.prePopoutRect).toEqual(RECT_B);
    });

    it("docking the pip-holder while a popup peer is open keeps the popup intact", () => {
      let state = withRegistered([
        { id: "w1", rect: RECT_A },
        { id: "w2", rect: RECT_B },
      ]);
      state = reducer(state, popOutWindow({ id: "w1", mode: "pip" }));
      state = reducer(state, popOutWindow({ id: "w2", mode: "popup" }));
      // Dock w1 (the PiP) — w2 should be untouched
      state = dock(state, "w1");
      expect(state.windows.w1.popoutMode).toBeNull();
      expect(state.windows.w2.popoutMode).toBe("popup");
      // PiP slot is now free
      expect(state.activePipWindowId).toBeNull();
    });

    it("allows the same window to re-dispatch popOutWindow idempotently", () => {
      let state = withRegistered([{ id: "w1", rect: RECT_A }]);
      state = reducer(state, popOutWindow({ id: "w1", mode: "pip" }));
      const firstPrePopoutRect = state.windows.w1.prePopoutRect;
      // Move the window while popped out (via the proper reducer)
      state = reducer(state, updateWindowRect({ id: "w1", rect: RECT_B }));
      // Re-dispatch — should NOT overwrite prePopoutRect
      state = reducer(state, popOutWindow({ id: "w1", mode: "pip" }));
      expect(state.windows.w1.prePopoutRect).toEqual(firstPrePopoutRect);
    });

    it("frees tray slot when popping out a minimized window", () => {
      let state = withRegistered([
        { id: "w1", rect: RECT_A },
        { id: "w2", rect: RECT_B },
      ]);
      state = reducer(
        state,
        minimizeWindow({ id: "w1", viewportWidth: 1280, viewportHeight: 800 }),
      );
      state = reducer(
        state,
        minimizeWindow({ id: "w2", viewportWidth: 1280, viewportHeight: 800 }),
      );
      expect(state.trayCount).toBe(2);
      // Pop out w1 from its minimized tray slot
      state = reducer(state, popOutWindow({ id: "w1", mode: "pip" }));
      expect(state.windows.w1.state).toBe("windowed");
      expect(state.windows.w1.traySlot).toBeNull();
      expect(state.trayCount).toBe(1);
      // Remaining minimized window's slot is compacted to 0
      expect(state.windows.w2.traySlot).toBe(0);
    });

    it("clears popoutCandidateId when the candidate is the popping-out window", () => {
      let state = withRegistered([{ id: "w1", rect: RECT_A }]);
      state = reducer(state, setPopoutCandidate({ id: "w1" }));
      expect(state.popoutCandidateId).toBe("w1");
      state = reducer(state, popOutWindow({ id: "w1", mode: "pip" }));
      expect(state.popoutCandidateId).toBeNull();
    });

    it("no-ops on unknown window id", () => {
      const state = withRegistered([{ id: "w1", rect: RECT_A }]);
      const after = reducer(state, popOutWindow({ id: "ghost", mode: "pip" }));
      expect(after).toEqual(state);
    });
  });

  describe("dockWindow", () => {
    it("centers using prePopoutRect size and clears popout state", () => {
      let state = withRegistered([{ id: "w1", rect: RECT_A }]);
      state = reducer(state, popOutWindow({ id: "w1", mode: "pip" }));
      // Simulate OS resize while popped out (via the proper reducer)
      state = reducer(state, updateWindowRect({ id: "w1", rect: RECT_B }));
      state = dock(state, "w1");
      expect(state.windows.w1.popoutMode).toBeNull();
      expect(state.windows.w1.prePopoutRect).toBeNull();
      expect(state.windows.w1.windowed).toEqual(
        centerRectInViewport(RECT_A, {
          width: VIEWPORT.viewportWidth,
          height: VIEWPORT.viewportHeight,
        }),
      );
    });

    it("releases the activePipWindowId slot on dock", () => {
      let state = withRegistered([{ id: "w1", rect: RECT_A }]);
      state = reducer(state, popOutWindow({ id: "w1", mode: "pip" }));
      expect(state.activePipWindowId).toBe("w1");
      state = dock(state, "w1");
      expect(state.activePipWindowId).toBeNull();
    });

    it("bumps zIndex to bring the docked window to top", () => {
      let state = withRegistered([
        { id: "w1", rect: RECT_A },
        { id: "w2", rect: RECT_B },
      ]);
      state = reducer(state, popOutWindow({ id: "w1", mode: "pip" }));
      const z2Before = state.windows.w2.zIndex;
      state = dock(state, "w1");
      expect(state.windows.w1.zIndex).toBeGreaterThan(z2Before);
    });

    it("after dock, second window can claim the pip slot", () => {
      let state = withRegistered([
        { id: "w1", rect: RECT_A },
        { id: "w2", rect: RECT_B },
      ]);
      state = reducer(state, popOutWindow({ id: "w1", mode: "pip" }));
      state = dock(state, "w1");
      state = reducer(state, popOutWindow({ id: "w2", mode: "pip" }));
      expect(state.windows.w2.popoutMode).toBe("pip");
      expect(state.activePipWindowId).toBe("w2");
    });

    it("no-ops if window is already docked", () => {
      const state = withRegistered([{ id: "w1", rect: RECT_A }]);
      const after = dock(state, "w1");
      expect(after).toEqual(state);
    });

    it("no-ops on unknown window id", () => {
      const state = withRegistered([{ id: "w1", rect: RECT_A }]);
      const after = reducer(state, dockWindow({ id: "ghost", ...VIEWPORT }));
      expect(after).toEqual(state);
    });
  });

  describe("setPopoutCandidate", () => {
    it("sets and clears the candidate id", () => {
      let state = withRegistered([{ id: "w1", rect: RECT_A }]);
      state = reducer(state, setPopoutCandidate({ id: "w1" }));
      expect(state.popoutCandidateId).toBe("w1");
      state = reducer(state, setPopoutCandidate({ id: null }));
      expect(state.popoutCandidateId).toBeNull();
    });
  });

  describe("unregisterWindow", () => {
    it("releases the pip slot if the unregistering window holds it", () => {
      let state = withRegistered([{ id: "w1", rect: RECT_A }]);
      state = reducer(state, popOutWindow({ id: "w1", mode: "pip" }));
      expect(state.activePipWindowId).toBe("w1");
      state = reducer(state, unregisterWindow("w1"));
      expect(state.activePipWindowId).toBeNull();
    });

    it("clears popoutCandidateId if the unregistering window is the candidate", () => {
      let state = withRegistered([{ id: "w1", rect: RECT_A }]);
      state = reducer(state, setPopoutCandidate({ id: "w1" }));
      state = reducer(state, unregisterWindow("w1"));
      expect(state.popoutCandidateId).toBeNull();
    });

    it("does NOT release the pip slot held by a different window", () => {
      let state = withRegistered([
        { id: "w1", rect: RECT_A },
        { id: "w2", rect: RECT_B },
      ]);
      state = reducer(state, popOutWindow({ id: "w1", mode: "pip" }));
      state = reducer(state, unregisterWindow("w2"));
      expect(state.activePipWindowId).toBe("w1");
    });
  });

  describe("minimizeWindow", () => {
    it("skips popped-out windows", () => {
      let state = withRegistered([{ id: "w1", rect: RECT_A }]);
      state = reducer(state, popOutWindow({ id: "w1", mode: "pip" }));
      const before = state.windows.w1;
      state = reducer(
        state,
        minimizeWindow({ id: "w1", viewportWidth: 1280, viewportHeight: 800 }),
      );
      // Window state should be unchanged
      expect(state.windows.w1.state).toBe(before.state);
      expect(state.windows.w1.popoutMode).toBe("pip");
      expect(state.windows.w1.traySlot).toBeNull();
      expect(state.trayCount).toBe(0);
    });
  });

  describe("minimizeAll", () => {
    it("skips popped-out windows", () => {
      let state = withRegistered([
        { id: "w1", rect: RECT_A },
        { id: "w2", rect: RECT_B },
      ]);
      state = reducer(state, popOutWindow({ id: "w1", mode: "pip" }));
      state = reducer(
        state,
        minimizeAll({ viewportWidth: 1280, viewportHeight: 800 }),
      );
      // w1 should remain popped out, w2 should be in tray
      expect(state.windows.w1.popoutMode).toBe("pip");
      expect(state.windows.w1.traySlot).toBeNull();
      expect(state.windows.w2.state).toBe("minimized");
      expect(state.windows.w2.traySlot).toBe(0);
      expect(state.trayCount).toBe(1);
    });
  });

  describe("arrangeActiveWindows", () => {
    it("excludes popped-out windows from layout", () => {
      let state = withRegistered([
        { id: "w1", rect: RECT_A },
        { id: "w2", rect: RECT_B },
      ]);
      state = reducer(state, popOutWindow({ id: "w1", mode: "pip" }));
      const w1RectBefore = { ...state.windows.w1.windowed };
      state = reducer(
        state,
        arrangeActiveWindows({
          layout: "grid4",
          viewportWidth: 1280,
          viewportHeight: 800,
        }),
      );
      // w1 should be untouched (it's popped out)
      expect(state.windows.w1.windowed).toEqual(w1RectBefore);
      // w2 should have moved (got the only grid slot)
      expect(state.windows.w2.windowed).not.toEqual(RECT_B);
    });
  });

  describe("restoreWindowState", () => {
    it("coerces popoutMode and prePopoutRect to null on hydration", () => {
      let state = withRegistered([{ id: "w1", rect: RECT_A }]);
      // Simulate persisted data that (incorrectly) saved popout state
      const restored: Record<string, WindowEntry> = {
        w1: {
          id: "w1",
          title: "W1",
          state: "windowed",
          windowed: RECT_B,
          preMinimizedRect: null,
          zIndex: 5000,
          traySlot: null,
          popoutMode: "pip",
          prePopoutRect: RECT_A,
        },
      };
      state = reducer(state, restoreWindowState(restored));
      expect(state.windows.w1.popoutMode).toBeNull();
      expect(state.windows.w1.prePopoutRect).toBeNull();
      // Geometry still restored
      expect(state.windows.w1.windowed).toEqual(RECT_B);
    });

    it("clears top-level popout fields on hydration", () => {
      let state = withRegistered([{ id: "w1", rect: RECT_A }]);
      state = reducer(state, popOutWindow({ id: "w1", mode: "pip" }));
      state = reducer(state, setPopoutCandidate({ id: "w1" }));
      // Hydration with empty payload should still clear top-level slots
      state = reducer(state, restoreWindowState({}));
      expect(state.activePipWindowId).toBeNull();
      expect(state.popoutCandidateId).toBeNull();
    });
  });
});
