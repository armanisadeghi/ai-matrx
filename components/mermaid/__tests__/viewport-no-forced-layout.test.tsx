/**
 * FORCING FUNCTION: drawing a diagram into the page never forces a layout.
 *
 * THE DEFECT (2026-09-26): MermaidViewport fitted each new diagram by reading
 * the frame's clientWidth/clientHeight right after its markup went into the
 * page. On a 1 MB document every read forced a layout of the whole document —
 * 20–1,800 ms per diagram, and 13–22 s when they all mounted at once. The frame
 * size now comes from the ResizeObserver, which reports after the browser's own
 * layout. This counts clientWidth/clientHeight reads between the markup going
 * in and the first observer report: there must be none.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

let reads = 0;
let observing = true;
for (const prop of ["clientWidth", "clientHeight"] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, {
    configurable: true,
    get() {
      if (!observing) reads++;
      return 600;
    },
  });
}

const observers: Array<() => void> = [];
class ManualResizeObserver {
  constructor(private cb: () => void) {
    observers.push(() => this.cb());
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ManualResizeObserver;
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { MermaidViewport } from "../MermaidViewport";

const SVG = '<svg viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg"><text>x</text></svg>';

it("a new diagram is fitted without reading the frame's size from a dirty layout", async () => {
  jest.useFakeTimers();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  observing = false;
  await act(async () => {
    root.render(<MermaidViewport svg={SVG} />);
  });
  // Frame callbacks and timers that ran after the markup went in.
  await act(async () => {
    jest.advanceTimersByTime(100);
  });
  expect(reads).toBe(0);

  // The observer's report (layout already clean) is where the size is read.
  observing = true;
  await act(async () => {
    for (const report of observers) report();
  });
  const svg = host.querySelector("svg") as SVGSVGElement;
  expect(svg.style.width).not.toBe("");
  await act(async () => root.unmount());
  jest.useRealTimers();
});
