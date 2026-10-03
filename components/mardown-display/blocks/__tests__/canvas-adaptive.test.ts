/**
 * Each canvas renderer adapts to the shape of the canvas pane it is shown in
 * — and outside the canvas (no presentation) nothing changes. One rule per
 * renderer; every `null` case is the "outside the canvas" half.
 */
import { canvasPresentation } from "@ai-matrx/canvas";
import {
  chartPaneLayout,
  decisionBranchesSideBySide,
  diagramScrollPans,
  diffIsSplit,
  fitScale,
  mapPlacesList,
  mermaidSourceForFlow,
  portraitWidthFitViewport,
  slideThumbnailPlacement,
  timelineAxis,
  treeWrapsLines,
} from "../canvas-adaptive";

const pane = (width: number, height: number) =>
  canvasPresentation({ width, height, isFullscreen: false, paneCount: 1 });

const PHONE = pane(360, 760); // portrait, narrow
const HALF = pane(630, 820); // portrait, not narrow
const WIDE = pane(1400, 820); // full screen, landscape
const OUTSIDE = null;

describe("diagram: a portrait pane fits the graph to its width and scrolls down", () => {
  // A tall layered graph: 600 wide, 2400 tall.
  const bounds = { x: 0, y: 0, width: 600, height: 2400 };
  const containedZoom = 0.3; // what fitting the whole graph would give
  const fit = (presentation: ReturnType<typeof pane> | null) =>
    portraitWidthFitViewport({
      presentation,
      bounds,
      width: 360,
      height: 760,
      minZoom: 0.05,
      maxZoom: 2,
      padding: 0.1,
      containedZoom,
    });

  it("in a portrait canvas pane the zoom is the width fit and the graph starts at the top", () => {
    const v = fit(PHONE);
    expect(v).not.toBeNull();
    expect(v!.zoom).toBeCloseTo((360 * 0.8) / 600);
    expect(v!.y).toBeCloseTo(76); // top padding, not vertically centred
    expect(diagramScrollPans(PHONE)).toBe(true);
  });

  it("outside the canvas and in a wide pane nothing changes", () => {
    expect(fit(OUTSIDE)).toBeNull();
    expect(fit(WIDE)).toBeNull();
    expect(diagramScrollPans(OUTSIDE)).toBe(false);
  });
});

describe("timeline: vertical in portrait, left to right in a wide pane", () => {
  it("adapts in the canvas", () => {
    expect(timelineAxis(PHONE)).toBe("vertical");
    expect(timelineAxis(HALF)).toBe("vertical");
    expect(timelineAxis(WIDE)).toBe("horizontal");
  });
  it("outside the canvas it stays vertical", () => {
    expect(timelineAxis(OUTSIDE)).toBe("vertical");
  });
});

describe("tree: grows downward in a portrait pane", () => {
  it("wraps long lines in a portrait canvas pane only", () => {
    expect(treeWrapsLines(PHONE)).toBe(true);
    expect(treeWrapsLines(WIDE)).toBe(false);
    expect(treeWrapsLines(OUTSIDE)).toBe(false);
  });
});

describe("decision tree: branches stack in portrait, side by side when wide", () => {
  it("adapts in the canvas and never outside it", () => {
    expect(decisionBranchesSideBySide(PHONE)).toBe(false);
    expect(decisionBranchesSideBySide(HALF)).toBe(false);
    expect(decisionBranchesSideBySide(WIDE)).toBe(true);
    expect(decisionBranchesSideBySide(OUTSIDE)).toBe(false);
  });
});

describe("chart: taller with the legend below when narrow; bars turn sideways in portrait", () => {
  it("a portrait pane gets a tall plot, legend below and horizontal bars", () => {
    const l = chartPaneLayout(PHONE, "bar")!;
    expect(l.legend).toBe("bottom");
    expect(l.horizontalBars).toBe(true);
    expect(l.height).toBeGreaterThan(340);
    expect(chartPaneLayout(PHONE, "line")!.horizontalBars).toBe(false);
  });
  it("a wide pane keeps vertical bars with the legend at the side", () => {
    const l = chartPaneLayout(WIDE, "bar")!;
    expect(l.legend).toBe("right");
    expect(l.horizontalBars).toBe(false);
  });
  it("outside the canvas there is no pane layout", () => {
    expect(chartPaneLayout(OUTSIDE, "bar")).toBeNull();
  });
});

describe("presentation: the slide scales to fit; thumbnails below in portrait", () => {
  it("places thumbnails by the pane's shape, and not at all outside the canvas", () => {
    expect(slideThumbnailPlacement(PHONE)).toBe("below");
    expect(slideThumbnailPlacement(HALF)).toBe("below");
    expect(slideThumbnailPlacement(WIDE)).toBe("side");
    expect(slideThumbnailPlacement(OUTSIDE)).toBeNull();
  });
  it("fits the 16:9 stage by whichever side runs out first", () => {
    const stage = { width: 960, height: 540 };
    expect(fitScale(stage, { width: 340, height: 600 })).toBeCloseTo(340 / 960);
    expect(fitScale(stage, { width: 1400, height: 540 })).toBeCloseTo(1);
  });
});

describe("diff: side by side when wide, unified when narrow", () => {
  const split = (
    presentation: ReturnType<typeof pane> | null,
    extra: Partial<Parameters<typeof diffIsSplit>[0]> = {},
  ) =>
    diffIsSplit({
      presentation,
      personChoice: null,
      authored: true,
      authoredExplicitly: false,
      ...extra,
    });

  it("follows the pane in the canvas", () => {
    expect(split(PHONE)).toBe(false);
    expect(split(WIDE)).toBe(true);
  });
  it("outside the canvas the authored default (split) is unchanged", () => {
    expect(split(OUTSIDE)).toBe(true);
  });
  it("a person's toggle and an author's explicit split always win", () => {
    expect(split(PHONE, { personChoice: true })).toBe(true);
    expect(split(PHONE, { authoredExplicitly: true })).toBe(true);
    expect(split(WIDE, { authored: false, authoredExplicitly: true })).toBe(false);
  });
});

describe("map: the places list sits beside a wide map, behind a toggle when narrow", () => {
  it("adapts in the canvas and adds nothing outside it", () => {
    expect(mapPlacesList(PHONE)).toBe("toggle");
    expect(mapPlacesList(WIDE)).toBe("side");
    expect(mapPlacesList(OUTSIDE)).toBeNull();
  });
});

describe("mermaid: an undeclared direction follows the pane; a declared one never changes", () => {
  it("picks TB in portrait and LR in a wide pane when the header has no direction", () => {
    expect(mermaidSourceForFlow("flowchart\n  A --> B", "vertical")).toBe(
      "flowchart TB\n  A --> B",
    );
    expect(mermaidSourceForFlow("graph;\nA-->B", "horizontal")).toBe(
      "graph LR;\nA-->B",
    );
    expect(
      mermaidSourceForFlow(
        "---\ntitle: Pickup\n---\n%%{init: {}}%%\nflowchart\nA-->B",
        "horizontal",
      ),
    ).toBe("---\ntitle: Pickup\n---\n%%{init: {}}%%\nflowchart LR\nA-->B");
  });
  it("never rewrites an author's explicit direction or a non-flowchart", () => {
    expect(mermaidSourceForFlow("flowchart RL\nA-->B", "vertical")).toBe(
      "flowchart RL\nA-->B",
    );
    expect(mermaidSourceForFlow("graph TD\nA-->B", "horizontal")).toBe(
      "graph TD\nA-->B",
    );
    expect(mermaidSourceForFlow("sequenceDiagram\nA->>B: hi", "vertical")).toBe(
      "sequenceDiagram\nA->>B: hi",
    );
  });
  it("outside the canvas the source is drawn as written", () => {
    expect(mermaidSourceForFlow("flowchart\nA-->B", null)).toBe(
      "flowchart\nA-->B",
    );
  });
});
