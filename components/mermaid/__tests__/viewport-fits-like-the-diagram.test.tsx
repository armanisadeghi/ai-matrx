/**
 * FORCING FUNCTION: a mermaid drawing follows THE diagram fit rule
 * (`canvas-adaptive.ts`): the whole drawing when that scale is readable
 * (>= DIAGRAM_READABLE_ZOOM), else the width down to that floor, starting at
 * the top-left.
 *
 * THE DEFECT (2026-10-02): the viewer fitted a wide drawing to the pane's
 * HEIGHT and capped at natural size, so an expanded left-to-right flowchart
 * (1648px in a 1370px pane) overflowed sideways although it fits whole at
 * ~0.83.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { DIAGRAM_READABLE_ZOOM } from "@/components/mardown-display/blocks/canvas-adaptive";

let frame = { w: 1370, h: 800 };
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

import { MermaidViewport, mermaidFitScale } from "../MermaidViewport";
import { TooltipProvider } from "@/components/ui/tooltip";

const PAD = 16;
const svgOf = (w: number, h: number) =>
  `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><text>x</text></svg>`;

async function draw(w: number, h: number) {
  observers.length = 0;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <TooltipProvider>
        <MermaidViewport svg={svgOf(w, h)} fillHeight />
      </TooltipProvider>,
    );
  });
  await act(async () => {
    for (const r of observers) r();
  });
  const svg = host.querySelector("svg") as SVGSVGElement;
  return { host, root, svg };
}

it("an expanded LR flowchart that fits whole at a readable scale fits whole", async () => {
  frame = { w: 1370, h: 800 };
  const { root, svg } = await draw(1648, 400);
  const scale = (1370 - PAD) / 1648; // ~0.82, readable
  expect(scale).toBeGreaterThanOrEqual(DIAGRAM_READABLE_ZOOM);
  expect(svg.style.width).toBe(`${Math.round(1648 * scale)}px`);
  expect(parseInt(svg.style.width, 10)).toBeLessThanOrEqual(1370 - PAD);
  await act(async () => root.unmount());
});

it("a drawing too wide to fit readably fits width at the floor and starts at the top-left", async () => {
  frame = { w: 1370, h: 800 };
  const { host, root, svg } = await draw(4000, 400);
  expect(svg.style.width).toBe(`${Math.round(4000 * DIAGRAM_READABLE_ZOOM)}px`);
  const inner = host.querySelector("svg")!.parentElement!.parentElement!;
  // Safe centering: overflow goes right/down, never past an unscrollable edge.
  expect(inner.className).toContain("justify-center-safe");
  expect(inner.className).toContain("items-center-safe");
  expect(inner.parentElement!.scrollLeft).toBe(0);
  await act(async () => root.unmount());
});

describe("mermaidFitScale", () => {
  it("fits whole when readable, never upscales", () => {
    expect(mermaidFitScale({ w: 1648, h: 400 }, 1354, 784)).toEqual({
      scale: 1354 / 1648,
      whole: true,
    });
    expect(mermaidFitScale({ w: 300, h: 200 }, 1354, 784)).toEqual({
      scale: 1,
      whole: true,
    });
  });
  it("a tall drawing fits width and scrolls down", () => {
    expect(mermaidFitScale({ w: 600, h: 3000 }, 1354, 784)).toEqual({
      scale: 1,
      whole: false,
    });
  });
  it("never auto-fits below the readable floor", () => {
    expect(mermaidFitScale({ w: 9000, h: 9000 }, 1354, 784).scale).toBe(
      DIAGRAM_READABLE_ZOOM,
    );
  });
  it("a frame with no height bound fits width only", () => {
    expect(mermaidFitScale({ w: 1000, h: 5000 }, 800, Infinity)).toEqual({
      scale: 0.8,
      whole: true,
    });
  });
});
