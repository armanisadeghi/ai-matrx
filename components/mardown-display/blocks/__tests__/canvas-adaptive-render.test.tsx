/**
 * The blocks actually consult the canvas pane: rendered inside a canvas pane
 * (a presentation is present) they change shape; rendered anywhere else
 * (`useCanvasPresentation()` → null) they render exactly as before.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { canvasPresentation, type CanvasPresentation } from "@ai-matrx/canvas";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let currentPresentation: CanvasPresentation | null = null;
jest.mock("@ai-matrx/canvas/react", () => ({
  useCanvasPresentation: () => currentPresentation,
}));
// Heavy renderers (recharts, leaflet, the diff engine) sit behind next/dynamic;
// these tests are about the shell's layout decision, not the drawing.
jest.mock("next/dynamic", () => () => () => <div data-probe="dynamic" />);
jest.mock("@/features/code-editor/components/code-block/CodeBlock", () => ({
  __esModule: true,
  default: () => <pre />,
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({
  ErrorAlchemyMenu: () => null,
}));

import TreeBlock from "../tree/TreeBlock";
import { DiffBlock } from "../diff/DiffBlock";
import { MapBlock } from "../map/MapBlock";
import { ChartBlock } from "../chart/ChartBlock";

const PORTRAIT = canvasPresentation({ width: 360, height: 760, isFullscreen: false, paneCount: 1 });
const WIDE = canvasPresentation({ width: 1400, height: 820, isFullscreen: false, paneCount: 1 });

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  currentPresentation = null;
});

function render(node: React.ReactElement, presentation: CanvasPresentation | null) {
  currentPresentation = presentation;
  act(() => root.render(node));
  return container;
}
const attr = (el: HTMLElement, name: string) =>
  el.querySelector(`[${name}]`)?.getAttribute(name);

const TREE = "root\n├── a very long branch label that would push a narrow pane sideways\n└── leaf";
const DIFF = JSON.stringify({ old: "Curbside pickup: $35", new: "Curbside pickup: $40" });
const MAP = JSON.stringify({ markers: [{ lat: 33.6, lng: -117.8, label: "Irvine yard" }, { lat: 34.05, lng: -118.24, label: "LA depot" }] });
const CHART = JSON.stringify({ type: "bar", title: "Loads by yard", data: [{ yard: "Irvine", loads: 12 }, { yard: "LA", loads: 30 }], xKey: "yard", series: [{ key: "loads" }] });

describe("tree", () => {
  it("wraps in a portrait canvas pane, scrolls sideways outside the canvas", () => {
    expect(attr(render(<TreeBlock content={TREE} />, PORTRAIT), "data-tree-wrap")).toBe("wrap");
    expect(attr(render(<TreeBlock content={TREE} />, null), "data-tree-wrap")).toBe("scroll");
  });
});

describe("diff", () => {
  it("is unified in a narrow canvas pane, split when wide and outside the canvas", () => {
    expect(attr(render(<DiffBlock content={DIFF} />, PORTRAIT), "data-diff-view")).toBe("unified");
    expect(attr(render(<DiffBlock content={DIFF} />, WIDE), "data-diff-view")).toBe("split");
    expect(attr(render(<DiffBlock content={DIFF} />, null), "data-diff-view")).toBe("split");
  });
});

describe("map", () => {
  it("puts the places list behind a toggle when narrow, beside the map when wide, nowhere outside", () => {
    const narrow = render(<MapBlock content={MAP} />, PORTRAIT);
    expect(attr(narrow, "data-map-places")).toBe("toggle");
    expect(narrow.querySelector('[aria-label="Places"]')).toBeNull();
    act(() => (narrow.querySelector('[aria-label="Show places"]') as HTMLButtonElement).click());
    expect(narrow.querySelector('[aria-label="Places"]')?.textContent).toContain("Irvine yard");

    const wide = render(<MapBlock content={MAP} />, WIDE);
    expect(attr(wide, "data-map-places")).toBe("side");
    expect(wide.querySelector('[aria-label="Places"]')).not.toBeNull();

    const outside = render(<MapBlock content={MAP} />, null);
    expect(attr(outside, "data-map-places")).toBe("none");
    expect(outside.querySelector('[aria-label="Places"]')).toBeNull();
  });
});

describe("chart", () => {
  it("turns bars sideways with the legend below in a portrait pane; unchanged outside", () => {
    const portrait = render(<ChartBlock content={CHART} />, PORTRAIT);
    expect(attr(portrait, "data-chart-bars")).toBe("horizontal");
    expect(attr(portrait, "data-chart-legend")).toBe("bottom");

    const outside = render(<ChartBlock content={CHART} />, null);
    expect(attr(outside, "data-chart-bars")).toBe("vertical");
    expect(attr(outside, "data-chart-legend")).toBe("default");
    expect(outside.querySelector(".h-\\[340px\\]")).not.toBeNull();
  });
});
