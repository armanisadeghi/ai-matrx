/**
 * FORCING FUNCTION: a mermaid drawing re-fits when its pane resizes — unless
 * the person zoomed or panned by hand since the last fit.
 *
 * THE DEFECT (2026-10-02): in a canvas pane the viewer re-fitted on frame
 * WIDTH changes only, so growing the pane's height (unsplit a top/bottom
 * split, Expand) left the drawing at its old small size in the middle of the
 * bigger pane. A full-height viewer now re-fits on either axis; a manual
 * zoom/pan keeps its view.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { shouldRefitOnResize } from "../MermaidViewport";

let frame = { w: 1000, h: 300 };
for (const [prop, axis] of [
  ["clientWidth", "w"],
  ["clientHeight", "h"],
] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, {
    configurable: true,
    get() {
      return frame[axis];
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
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
  ManualResizeObserver;
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

import { MermaidViewport } from "../MermaidViewport";
import { TooltipProvider } from "@/components/ui/tooltip";

// A square drawing: too tall for a short pane (width fit), whole in a tall one.
const SVG =
  '<svg viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg"><text>x</text></svg>';
const SHORT = { w: 1416, h: 416 };

async function mount() {
  observers.length = 0;
  frame = { ...SHORT };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <TooltipProvider>
        <MermaidViewport svg={SVG} fillHeight />
      </TooltipProvider>,
    );
  });
  const report = async () => {
    await act(async () => {
      for (const r of observers) r();
    });
  };
  await report();
  const svg = () => host.querySelector("svg") as SVGSVGElement;
  return { host, root, report, svg };
}

it("the pane growing taller re-fits the drawing to the bigger pane", async () => {
  const { root, report, svg } = await mount();
  const before = svg().style.width;
  // 400/1000 whole is unreadable: width fit, capped at natural size.
  expect(before).toBe("1000px");
  frame = { w: 1416, h: 816 }; // unsplit: same width, taller
  await report();
  // The whole drawing now fits at a readable 0.8.
  expect(svg().style.width).toBe("800px");
  await act(async () => root.unmount());
});

it("a manual zoom since the last fit keeps the person's view when the pane resizes", async () => {
  const { host, root, report, svg } = await mount();
  const zoomIn = host.querySelector(
    'button[aria-label="Zoom in"]',
  ) as HTMLButtonElement;
  await act(async () => zoomIn.click());
  const zoomed = svg().style.width;
  frame = { w: 1400, h: 700 };
  await report();
  expect(svg().style.width).toBe(zoomed);
  // Fit again hands the view back to the pane.
  const fitButton = host.querySelector(
    'button[aria-label="Fit to view"]',
  ) as HTMLButtonElement;
  await act(async () => fitButton.click());
  frame = { w: 1416, h: 816 };
  await report();
  expect(svg().style.width).toBe("800px");
  await act(async () => root.unmount());
});

it("a new drawing fitted to the same scale as the old one is still sized", async () => {
  // Expand redraws a direction-less flowchart TB -> LR. When both drawings fit
  // at the same scale, `scale` never changes — the new SVG must be sized anyway.
  const { host, root, svg } = await mount();
  frame = { w: 1700, h: 1100 };
  await act(async () => {
    for (const r of observers) r();
  });
  expect(svg().style.width).toBe("1000px"); // capped at natural size (scale 1)
  await act(async () => {
    root.render(
      <TooltipProvider>
        <MermaidViewport
          svg={'<svg viewBox="0 0 400 1000" xmlns="http://www.w3.org/2000/svg"><text>y</text></svg>'}
          fillHeight
        />
      </TooltipProvider>,
    );
  });
  const next = host.querySelector("svg") as SVGSVGElement;
  expect(next.getAttribute("viewBox")).toBe("0 0 400 1000");
  expect(next.style.width).toBe("400px"); // scale 1 again: unchanged state
  await act(async () => root.unmount());
});

describe("shouldRefitOnResize", () => {
  const base = {
    previous: { w: 600, h: 400 },
    fillHeight: true,
    userAdjusted: false,
    fitPending: false,
  };
  it("re-fits on a width or (full-height viewer) height change", () => {
    expect(shouldRefitOnResize({ ...base, next: { w: 900, h: 400 } })).toBe(true);
    expect(shouldRefitOnResize({ ...base, next: { w: 600, h: 900 } })).toBe(true);
    expect(shouldRefitOnResize({ ...base, next: { w: 600, h: 400 } })).toBe(false);
  });
  it("a content-height frame re-fits on width only", () => {
    expect(
      shouldRefitOnResize({ ...base, fillHeight: false, next: { w: 600, h: 900 } }),
    ).toBe(false);
  });
  it("never after a manual zoom or pan", () => {
    expect(
      shouldRefitOnResize({ ...base, userAdjusted: true, next: { w: 900, h: 900 } }),
    ).toBe(false);
  });
});
