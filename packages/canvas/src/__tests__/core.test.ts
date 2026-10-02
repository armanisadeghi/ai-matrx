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
