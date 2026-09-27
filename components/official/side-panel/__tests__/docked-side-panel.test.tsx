/**
 * DockedSidePanel — the three behaviours an independent review found missing
 * (2026-09-27), pinned:
 *
 *   1. A remembered width never crushes the page: it is clamped to `maxShare`
 *      of the parent the panel sits in (a 720px dock in a 1000px window is 500).
 *   2. A drag interrupted by the panel closing (its handle unmounts) still ends
 *      on the window's pointerup: the page's resize cursor and text selection
 *      come back, and the width the pointer reached is saved.
 *   3. The separator answers the keyboard (→ grows a left panel, Home = min).
 *
 * PROVEN FAILING BEFORE PASSING: against the first version (handle-level
 * pointer capture, max checked only while dragging) cases 1 and 2 are red.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DockedSidePanel } from "../DockedSidePanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SIZES = { defaultPx: 420, minPx: 340, maxPx: 720 };
let parentWidth = 1000;

class ImmediateResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe() {
    this.callback([], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ImmediateResizeObserver;
  host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { configurable: true, get: () => parentWidth });
  document.body.appendChild(host);
  root = createRoot(host);
  document.cookie = "side-panel:test-panel:width=; max-age=0; path=/";
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  parentWidth = 1000;
});

function render(props: Partial<React.ComponentProps<typeof DockedSidePanel>> = {}) {
  act(() => {
    root.render(
      <DockedSidePanel panelId="test-panel" edge="left" open sizes={SIZES} aria-label="Test" {...props}>
        <div>body</div>
      </DockedSidePanel>,
    );
  });
}

const panel = () => host.querySelector<HTMLElement>('[data-side-panel="test-panel"]')!;
const handle = () => host.querySelector<HTMLElement>('[role="separator"]');
const pointer = (target: EventTarget, type: string, clientX: number) =>
  act(() => {
    const event = new MouseEvent(type, { bubbles: true, clientX, button: 0 });
    target.dispatchEvent(Object.assign(event, { pointerId: 1 }));
  });

describe("DockedSidePanel", () => {
  it("clamps a remembered width to its share of the parent, and gives it back when there is room", () => {
    render({ initialWidth: 720, maxShare: 0.5 });
    expect(panel().style.width).toBe("500px");
    expect(handle()?.getAttribute("aria-valuemax")).toBe("500");
    // A wider window: the chosen 720 comes back (the choice was kept, not overwritten).
    parentWidth = 1600;
    act(() => root.unmount());
    root = createRoot(host);
    render({ initialWidth: 720, maxShare: 0.5 });
    expect(panel().style.width).toBe("720px");
  });

  it("ends a drag on the window's pointerup even when the panel closed mid-drag", () => {
    render();
    expect(panel().style.width).toBe("420px");
    pointer(handle()!, "pointerdown", 420);
    expect(document.body.style.cursor).toBe("col-resize");
    pointer(window, "pointermove", 520);
    expect(panel().style.width).toBe("520px");
    render({ open: false });
    expect(handle()).toBeNull();
    pointer(window, "pointerup", 520);
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
    expect(document.cookie).toContain("side-panel:test-panel:width=520");
  });

  it("answers the keyboard: → grows a left panel, Home is the minimum", () => {
    render();
    act(() => {
      handle()!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(panel().style.width).toBe("436px");
    act(() => {
      handle()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    });
    expect(panel().style.width).toBe("340px");
  });

  it("is inert and zero-wide when closed, keeping its content mounted", () => {
    render({ open: false });
    expect(panel().style.width).toBe("0px");
    expect(panel().hasAttribute("inert")).toBe(true);
    expect(host.textContent).toContain("body");
  });
});
