import {
  canvasActions,
  canvasItemId,
  canvasReducer,
  createCanvasController,
  createCanvasStore,
  createInitialCanvasState,
  listPaneIds,
  sanitizeCanvasSnapshot,
  toPersistableSnapshot,
  type CanvasErrorReport,
  type CanvasPersistencePort,
  type CanvasState,
} from "../index";

function run(...actions: ReturnType<(typeof canvasActions)[keyof typeof canvasActions]>[]): CanvasState {
  return actions.reduce<CanvasState>((s, a) => canvasReducer(s, a), createInitialCanvasState());
}

const open = (key: string, extra: Partial<Parameters<typeof canvasActions.open>[0]> = {}) =>
  canvasActions.open({ kind: "doc", key, data: { key }, ...extra });

describe("identity", () => {
  it("opening the same thing twice keeps one tab and refreshes its data", () => {
    const s = run(open("a"), open("b"), open("a", { data: { key: "a", v: 2 } }));
    const pane = s.panes[s.focusedPaneId];
    expect(Object.keys(s.items)).toHaveLength(2);
    expect(pane?.itemIds).toEqual([canvasItemId("doc", "a"), canvasItemId("doc", "b")]);
    expect(pane?.activeItemId).toBe(canvasItemId("doc", "a"));
    expect(s.items[canvasItemId("doc", "a")]?.data).toEqual({ key: "a", v: 2 });
  });

  it("re-opening an item that lives in another pane focuses that pane instead of moving it", () => {
    let s = run(open("a"), open("b", { target: "split-right" }));
    const [left, right] = listPaneIds(s.layout);
    expect(s.focusedPaneId).toBe(right);
    s = canvasReducer(s, open("a"));
    expect(s.focusedPaneId).toBe(left);
    expect(s.panes[right!]?.itemIds).toEqual([canvasItemId("doc", "b")]);
  });

  it("opening reveals a put-away canvas unless told not to", () => {
    expect(run(open("a")).isOpen).toBe(true);
    expect(run(open("a", { reveal: false })).isOpen).toBe(false);
  });
});

describe("panes and splits", () => {
  it("split-right then split-down builds a nested layout and closing collapses it", () => {
    let s = run(open("a"), open("b", { target: "split-right" }), open("c", { target: "split-down" }));
    expect(listPaneIds(s.layout)).toHaveLength(3);
    expect(s.layout.type).toBe("split");
    s = canvasReducer(s, canvasActions.closeItem(canvasItemId("doc", "c")));
    expect(listPaneIds(s.layout)).toHaveLength(2);
    s = canvasReducer(s, canvasActions.closeItem(canvasItemId("doc", "b")));
    expect(s.layout).toEqual({ type: "pane", paneId: listPaneIds(s.layout)[0] });
  });

  it("splitPane moves the active tab only when the old pane keeps something", () => {
    let s = run(open("a"));
    const only = s.focusedPaneId;
    s = canvasReducer(s, canvasActions.splitPane(only, "horizontal", canvasItemId("doc", "a")));
    expect(s.panes[only]?.itemIds).toEqual([canvasItemId("doc", "a")]);
    const fresh = listPaneIds(s.layout)[1]!;
    expect(s.panes[fresh]?.itemIds).toEqual([]);
  });

  it("closing the last pane puts the canvas away and keeps every tab", () => {
    let s = run(open("a"), open("b"));
    s = canvasReducer(s, canvasActions.closePane(s.focusedPaneId));
    expect(s.isOpen).toBe(false);
    expect(Object.keys(s.items)).toHaveLength(2);
    s = canvasReducer(s, canvasActions.toggle());
    expect(s.isOpen).toBe(true);
  });

  it("moving the last tab out of a pane removes that pane", () => {
    let s = run(open("a"), open("b", { target: "split-right" }));
    const [left] = listPaneIds(s.layout);
    s = canvasReducer(s, canvasActions.moveItem(canvasItemId("doc", "b"), left!));
    expect(listPaneIds(s.layout)).toEqual([left]);
    expect(s.panes[left!]?.itemIds).toHaveLength(2);
  });

  it("split sizes are clamped and normalized", () => {
    const s0 = run(open("a"), open("b", { target: "split-right" }));
    if (s0.layout.type !== "split") throw new Error("expected split");
    const s = canvasReducer(s0, canvasActions.resizeSplit(s0.layout.id, [0.99, 0.01]));
    if (s.layout.type !== "split") throw new Error("expected split");
    expect(s.layout.sizes.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(Math.min(...s.layout.sizes)).toBeGreaterThan(0.1);
  });
});

describe("memory", () => {
  it("a corrupt snapshot is refused whole instead of half applied", () => {
    expect(sanitizeCanvasSnapshot({ version: 1, panes: {}, items: {}, layout: { type: "pane", paneId: "nope" } })).toBeNull();
    expect(sanitizeCanvasSnapshot("garbage")).toBeNull();
  });

  it("non-restorable kinds are left out of what is saved", () => {
    const s = run(
      open("a"),
      canvasActions.open({ kind: "live", key: "x", target: "split-right" }),
    );
    const saved = toPersistableSnapshot(s, (kind) => kind !== "live");
    expect(Object.keys(saved.items)).toEqual([canvasItemId("doc", "a")]);
    expect(listPaneIds(saved.layout)).toHaveLength(1);
    expect(sanitizeCanvasSnapshot(saved)).not.toBeNull();
  });

  it("the controller restores a saved layout and keeps anything opened before it loaded", async () => {
    const before = run(open("saved"), canvasActions.setWidth(900));
    const persistence: CanvasPersistencePort = { load: async () => before, save: () => undefined };
    const store = createCanvasStore();
    const controller = createCanvasController({ store, persistence, saveDelayMs: 0 });
    controller.open({ kind: "doc", key: "early", data: null });
    const stop = controller.start();
    await new Promise((r) => setTimeout(r, 0));
    const s = store.getState();
    expect(s.hydrated).toBe(true);
    expect(s.width).toBe(900);
    expect(Object.keys(s.items).sort()).toEqual([canvasItemId("doc", "early"), canvasItemId("doc", "saved")].sort());
    stop();
  });
});

describe("controller refusals are loud", () => {
  it("refuses non-JSON data and unknown kinds through the error sink", () => {
    const reports: CanvasErrorReport[] = [];
    const controller = createCanvasController({
      store: createCanvasStore(),
      onError: (r) => reports.push(r),
      isKnownKind: (k) => k === "doc",
    });
    expect(controller.open({ kind: "doc", key: "a", data: { when: new Date() as unknown as string } })).toBeNull();
    expect(controller.open({ kind: "ghost", key: "a" })).toBeNull();
    expect(reports.map((r) => r.code)).toEqual(["non-json-data", "unknown-kind"]);
    expect(controller.getState().items).toEqual({});
  });
});

describe("review fixes (2026-10-02)", () => {
  it("rekey gives a saved draft its durable identity in place", () => {
    let s = run(open("draft"), open("other"));
    s = canvasReducer(s, canvasActions.rekey(canvasItemId("doc", "draft"), "artifact:1"));
    const pane = s.panes[s.focusedPaneId];
    expect(pane?.itemIds).toEqual([canvasItemId("doc", "artifact:1"), canvasItemId("doc", "other")]);
    expect(s.items[canvasItemId("doc", "draft")]).toBeUndefined();
    // Re-opening by the durable key focuses it — no duplicate.
    s = canvasReducer(s, open("artifact:1"));
    expect(Object.keys(s.items)).toHaveLength(2);
  });

  it("rekey onto an identity already open keeps that tab and drops the draft", () => {
    let s = run(open("draft"), open("artifact:1"));
    s = canvasReducer(s, canvasActions.rekey(canvasItemId("doc", "draft"), "artifact:1"));
    expect(Object.keys(s.items)).toEqual([canvasItemId("doc", "artifact:1")]);
  });

  it("dropping a tab back onto its own pane does not reorder it", () => {
    const s0 = run(open("a"), open("b"), canvasActions.activate(canvasItemId("doc", "a")));
    const s = canvasReducer(s0, canvasActions.moveItem(canvasItemId("doc", "b"), s0.focusedPaneId));
    expect(s.panes[s.focusedPaneId]?.itemIds).toEqual(s0.panes[s0.focusedPaneId]?.itemIds);
  });

  it("a restored snapshot never starts full screen, renormalizes sizes, and keeps seq ahead of its ids", () => {
    const s0 = run(open("a"), open("b", { target: "split-right" }), canvasActions.setFullscreen(true));
    if (s0.layout.type !== "split") throw new Error("expected split");
    const corrupt = { ...s0, seq: 0, layout: { ...s0.layout, sizes: [3, 1] } };
    const restored = sanitizeCanvasSnapshot(JSON.parse(JSON.stringify(corrupt)));
    if (!restored || restored.layout.type !== "split") throw new Error("expected split");
    expect(restored.isFullscreen).toBe(false);
    expect(restored.layout.sizes.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    const next = canvasReducer(restored, open("c", { target: "split-down" }));
    expect(new Set(listPaneIds(next.layout)).size).toBe(3);
  });

  it("autosave is not starved by host dispatches that do not touch the canvas", async () => {
    jest.useFakeTimers();
    try {
      const saves: CanvasState[] = [];
      let canvasState = createInitialCanvasState();
      let other = 0;
      const listeners = new Set<() => void>();
      const host = {
        getState: () => canvasState,
        dispatch: (a: Parameters<typeof canvasReducer>[1]) => {
          canvasState = canvasReducer(canvasState, a);
          listeners.forEach((l) => l());
        },
        subscribe: (l: () => void) => {
          listeners.add(l);
          return () => listeners.delete(l);
        },
      };
      const controller = createCanvasController({
        store: host,
        persistence: { load: () => null, save: (s) => void saves.push(s) },
        saveDelayMs: 250,
      });
      controller.start();
      await Promise.resolve();
      await Promise.resolve();
      controller.open({ kind: "doc", key: "a", data: null });
      // An unrelated slice dispatching every 100ms (streaming) must not keep pushing the save back.
      for (let i = 0; i < 10; i++) {
        other += 1;
        listeners.forEach((l) => l());
        jest.advanceTimersByTime(100);
      }
      expect(other).toBe(10);
      expect(saves.length).toBeGreaterThan(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it("a controller reports whether a column is on screen", () => {
    const controller = createCanvasController({ store: createCanvasStore() });
    expect(controller.isPresented()).toBe(false);
    const off = controller.registerPresentation();
    expect(controller.isPresented()).toBe(true);
    off();
    off();
    expect(controller.isPresented()).toBe(false);
  });
});
