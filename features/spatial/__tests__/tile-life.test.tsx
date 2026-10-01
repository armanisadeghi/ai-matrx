import { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { SpatialTile } from "../components/SpatialTile";
import { FocusHostContext, SpatialStoreContext } from "../engine/react";
import { FREEZE_AFTER_MS, SpatialStore, WARM_TILE_BUDGET } from "../engine/spatial-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * THE CLASS: a board of 10–15 full pages kept every hidden tile's editors,
 * chats, channels and timers running forever — paint culling hid them, nothing
 * paused them. A tile no longer needed is frozen (state kept, effects torn
 * down), and beyond the warm budget discarded.
 */
const rect = (i: number) => ({ x: i * 1000, y: 0, w: 400, h: 300 });

function viewStore(): SpatialStore {
  const s = new SpatialStore({ x: 0, y: 0, z: 1 });
  s.setSize({ w: 800, h: 600 }); // shows the first tile only
  return s;
}

describe("tile lifecycle — the store", () => {
  it("a tile out of view stays live through the grace period, then freezes", () => {
    const s = viewStore();
    s.registerItem("a", rect(0));
    s.registerItem("far", rect(10));
    const t0 = performance.now();
    s.recomputeCoarse();
    expect(s.getLife("a")).toBe("live");
    expect(s.getLife("far")).toBe("live"); // just registered: grace
    s.recomputeLife(t0 + FREEZE_AFTER_MS + 50);
    expect(s.getLife("far")).toBe("frozen");
    expect(s.getLife("a")).toBe("live");
  });

  it("selected, full-screen and held tiles never freeze; zooming to overview freezes the rest", () => {
    const s = viewStore();
    for (let i = 0; i < 4; i++) s.registerItem(`t${i}`, rect(i));
    s.select("t2");
    const release = s.holdAwake("t3");
    s.setCamera({ x: 0, y: 0, z: 0.1 }); // overview tier: everything in view, nothing readable
    s.recomputeCoarse();
    const later = performance.now() + FREEZE_AFTER_MS + 50;
    s.recomputeLife(later);
    expect(s.getLife("t0")).toBe("frozen");
    expect(s.getLife("t2")).toBe("live");
    expect(s.getLife("t3")).toBe("live");
    release();
    s.recomputeLife(later + FREEZE_AFTER_MS + 50);
    expect(s.getLife("t3")).toBe("frozen");
  });

  it("beyond the warm budget the least recently needed tiles are discarded", () => {
    const s = viewStore();
    const n = WARM_TILE_BUDGET + 3;
    for (let i = 0; i < n; i++) s.registerItem(`t${i}`, rect(i + 5)); // all out of view
    s.recomputeCoarse();
    s.recomputeLife(performance.now() + FREEZE_AFTER_MS + 50);
    const lives = [...Array(n).keys()].map((i) => s.getLife(`t${i}`));
    expect(lives.filter((l) => l === "frozen")).toHaveLength(WARM_TILE_BUDGET);
    expect(lives.filter((l) => l === "discarded")).toHaveLength(3);
    // A discarded tile scrolled back into view is live again.
    const gone = `t${lives.indexOf("discarded")}`;
    s.select(gone);
    expect(s.getLife(gone)).toBe("live");
  });
});

describe("tile lifecycle — a frozen tile keeps its state and stops its effects", () => {
  it("freezing tears the body's effects down and keeps its state; waking restores both", () => {
    const s = viewStore();
    const log: string[] = [];
    function Body() {
      const [count, setCount] = useState(0);
      useEffect(() => {
        log.push("subscribe");
        return () => void log.push("unsubscribe");
      }, []);
      return (
        <button type="button" data-count={count} onClick={() => setCount((c) => c + 1)}>
          {count}
        </button>
      );
    }
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    act(() =>
      root.render(
        <SpatialStoreContext.Provider value={s}>
          <FocusHostContext.Provider value={null}>
            <SpatialTile id="far" rect={rect(10)} title="Vendor contract review" onResize={null}>
              {() => <Body />}
            </SpatialTile>
          </FocusHostContext.Provider>
        </SpatialStoreContext.Provider>,
      ),
    );
    act(() => el.querySelector("button[data-count]")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(el.querySelector("button[data-count]")!.getAttribute("data-count")).toBe("1");
    expect(log).toEqual(["subscribe"]);

    act(() => {
      s.recomputeCoarse();
      s.recomputeLife(performance.now() + FREEZE_AFTER_MS + 50);
    });
    expect(s.getLife("far")).toBe("frozen");
    expect(log).toEqual(["subscribe", "unsubscribe"]);

    act(() => s.select("far")); // needed again
    expect(log).toEqual(["subscribe", "unsubscribe", "subscribe"]);
    expect(el.querySelector("button[data-count]")!.getAttribute("data-count")).toBe("1"); // state kept
    act(() => root.unmount());
    el.remove();
  });
});
