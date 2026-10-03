/**
 * How each render block adapts to the canvas pane it is shown in.
 *
 * Every function takes the live `CanvasPresentation` from
 * `useCanvasPresentation()` — `null` outside the canvas — and answers `null`
 * (or the block's existing behaviour) when there is none, so a block rendered
 * in chat, a note or a window is unchanged. Inside the canvas the pane's shape
 * decides (`preferredFlowDirection` from `@ai-matrx/canvas`): tall narrow panes
 * stack and flow top to bottom, wide panes sit side by side. A person's own
 * explicit choice (a toggle they pressed, a direction an author wrote) is
 * always passed in and always wins.
 *
 * Pure functions, so each rule is tested without a browser
 * (`__tests__/canvas-adaptive.test.ts`).
 */
import {
  preferredFlowDirection,
  type CanvasPresentation,
} from "@ai-matrx/canvas";

export type CanvasFlow = "vertical" | "horizontal";

/** Wide enough for two readable columns side by side. */
export const CANVAS_TWO_COLUMN_WIDTH = 640;

export function canvasFlow(p: CanvasPresentation | null): CanvasFlow | null {
  return p ? preferredFlowDirection(p) : null;
}

/** Room for things side by side: the pane flows horizontally and is not narrow. */
function isWidePane(p: CanvasPresentation): boolean {
  return (
    preferredFlowDirection(p) === "horizontal" &&
    !p.isNarrow &&
    p.width >= CANVAS_TWO_COLUMN_WIDTH
  );
}

// ── Diagram ────────────────────────────────────────────────────────────────

export interface FitBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface FitViewport {
  x: number;
  y: number;
  zoom: number;
}

/**
 * The smallest zoom a diagram is ever fitted to in a portrait canvas pane:
 * node titles (14px semibold) stay at or above ~10px on screen. Below this a
 * wide fan-out graph fitted to a 360px pane read at zoom 0.2–0.3 — every
 * label a smear. Tuned live on "How photosynthesis works" and "Ava Science
 * Book" (2026-10-02).
 */
export const DIAGRAM_READABLE_ZOOM = 0.72;

/**
 * A diagram in a portrait canvas pane fits the pane's WIDTH and starts at the
 * top; the rest is reached by scrolling down. Shrinking the whole graph to fit
 * a tall narrow pane makes every label unreadable, and the phone rule (fill
 * the height) forces sideways panning.
 *
 * The width fit never goes below `readableZoom`. When the graph is wider than
 * the pane at that zoom it starts at its ROOT — the top-left of the layout's
 * first rank (`firstRank`, the topmost nodes) — and the rest is reached by
 * scrolling down and panning across.
 *
 * Returns `null` when the graph already fits whole at a readable zoom (the
 * contained fit is used) or the pane is not portrait.
 */
export function portraitWidthFitViewport(input: {
  presentation: CanvasPresentation | null;
  bounds: FitBounds;
  /** Bounds of the layout's first rank; defaults to the graph's top-left. */
  firstRank?: FitBounds | null;
  width: number;
  height: number;
  minZoom: number;
  maxZoom: number;
  padding: number;
  containedZoom: number;
  readableZoom?: number;
}): FitViewport | null {
  const { presentation, bounds, width, height, minZoom, maxZoom, padding } =
    input;
  if (!presentation || preferredFlowDirection(presentation) !== "vertical") {
    return null;
  }
  if (!(width > 0) || !(height > 0) || !(bounds.width > 0)) return null;
  const usable = width * (1 - padding * 2);
  const widthZoom = Math.max(minZoom, usable / bounds.width);
  const readable = input.readableZoom ?? DIAGRAM_READABLE_ZOOM;
  const zoom = Math.min(maxZoom, Math.max(widthZoom, readable));
  if (zoom <= input.containedZoom) return null;
  const y = height * padding - bounds.y * zoom;
  if (bounds.width * zoom <= usable + 0.5) {
    return { zoom, x: width / 2 - (bounds.x + bounds.width / 2) * zoom, y };
  }
  // Wider than the pane at a readable zoom: start at the root, never past the
  // graph's right edge.
  const anchor = input.firstRank ?? bounds;
  const atRoot = width * padding - anchor.x * zoom;
  const rightmost = width * (1 - padding) - (bounds.x + bounds.width) * zoom;
  return { zoom, x: Math.max(atRoot, rightmost), y };
}

/**
 * The layout's first rank: the nodes whose top edge is the graph's topmost
 * (within `tolerance` px). In a top-to-bottom layout that is the root row.
 */
export function firstRankBounds(
  nodes: readonly FitBounds[],
  tolerance = 8,
): FitBounds | null {
  if (!nodes.length) return null;
  const top = Math.min(...nodes.map((n) => n.y));
  const rank = nodes.filter((n) => n.y <= top + tolerance);
  const x = Math.min(...rank.map((n) => n.x));
  const y = Math.min(...rank.map((n) => n.y));
  const right = Math.max(...rank.map((n) => n.x + n.width));
  const bottom = Math.max(...rank.map((n) => n.y + n.height));
  return { x, y, width: right - x, height: bottom - y };
}

/** Wheel and trackpad scroll the diagram down a portrait pane instead of zooming it. */
export function diagramScrollPans(p: CanvasPresentation | null): boolean {
  return p !== null && preferredFlowDirection(p) === "vertical";
}

// ── Timeline ───────────────────────────────────────────────────────────────

/** A timeline runs left to right across a wide pane; everywhere else top to bottom. */
export function timelineAxis(
  p: CanvasPresentation | null,
): "vertical" | "horizontal" {
  return p && isWidePane(p) ? "horizontal" : "vertical";
}

// ── Tree / decision tree ───────────────────────────────────────────────────

/** A text tree in a portrait pane wraps long lines downward instead of scrolling sideways. */
export function treeWrapsLines(p: CanvasPresentation | null): boolean {
  return p !== null && preferredFlowDirection(p) === "vertical";
}

/** A decision tree's Yes and No branches sit side by side in a wide pane; stacked otherwise. */
export function decisionBranchesSideBySide(
  p: CanvasPresentation | null,
): boolean {
  return p !== null && isWidePane(p);
}

// ── Chart ──────────────────────────────────────────────────────────────────

export interface ChartPaneLayout {
  /** Height of the plot area in px. */
  height: number;
  legend: "bottom" | "right";
  /** Bars grow sideways (categories down the left) in a portrait pane. */
  horizontalBars: boolean;
}

const CHART_MIN_HEIGHT = 340;
const CHART_CHROME = 120;

export function chartPaneLayout(
  p: CanvasPresentation | null,
  chartType: string,
): ChartPaneLayout | null {
  if (!p) return null;
  const vertical = preferredFlowDirection(p) === "vertical";
  const narrow = vertical || p.isNarrow;
  const room = Math.max(CHART_MIN_HEIGHT, p.height - CHART_CHROME);
  const wanted = narrow ? p.width * 1.25 : p.width * 0.5625;
  return {
    height: Math.round(Math.min(room, Math.max(CHART_MIN_HEIGHT, wanted))),
    legend: narrow ? "bottom" : "right",
    horizontalBars: vertical && chartType === "bar",
  };
}

// ── Presentation (slides) ──────────────────────────────────────────────────

export type SlideThumbnailPlacement = "below" | "side";

/** In the canvas the slide scales to fit; thumbnails sit below a portrait pane, beside a wide one. */
export function slideThumbnailPlacement(
  p: CanvasPresentation | null,
): SlideThumbnailPlacement | null {
  if (!p) return null;
  return isWidePane(p) ? "side" : "below";
}

/** The scale that fits a fixed-size slide stage inside a box, keeping its aspect ratio. */
export function fitScale(
  stage: { width: number; height: number },
  box: { width: number; height: number },
): number {
  if (!(box.width > 0) || !(stage.width > 0) || !(stage.height > 0)) return 0;
  const byWidth = box.width / stage.width;
  if (!(box.height > 0)) return byWidth;
  return Math.min(byWidth, box.height / stage.height);
}

// ── Diff ───────────────────────────────────────────────────────────────────

/**
 * Side by side when the pane is wide, one column when it is narrow. A person's
 * toggle always wins; so does an author who wrote `split` explicitly. Outside
 * the canvas the authored default (split) is unchanged.
 */
export function diffIsSplit(input: {
  presentation: CanvasPresentation | null;
  personChoice: boolean | null;
  authored: boolean;
  authoredExplicitly: boolean;
}): boolean {
  if (input.personChoice !== null) return input.personChoice;
  if (input.authoredExplicitly || !input.presentation) return input.authored;
  return isWidePane(input.presentation);
}

// ── Map ────────────────────────────────────────────────────────────────────

/** The list of places beside a map: always shown in a wide pane, behind a toggle when narrow. */
export function mapPlacesList(
  p: CanvasPresentation | null,
): "side" | "toggle" | null {
  if (!p) return null;
  return isWidePane(p) ? "side" : "toggle";
}

// ── Mermaid ────────────────────────────────────────────────────────────────

const MERMAID_FLOW_HEADER = /^(\s*)(flowchart|graph)\b([^\n]*)$/;
const MERMAID_DIRECTION = /^\s*(TB|TD|BT|RL|LR)\b/;

/**
 * The source to DRAW for a flowchart that declares no direction: TB in a
 * portrait pane, LR in a wide one. An author's explicit direction is never
 * touched, nothing outside the canvas changes, and the stored source is never
 * rewritten — this only shapes what is drawn.
 */
export function mermaidSourceForFlow(
  source: string,
  flow: CanvasFlow | null,
): string {
  if (flow === null) return source;
  const lines = source.split("\n");
  let i = 0;
  // Skip a leading `---` frontmatter block, blank lines, %% comments and
  // %%{init}%% directives to reach the header line.
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((l, idx) => idx > 0 && l.trim() === "---");
    if (end === -1) return source;
    i = end + 1;
  }
  while (
    i < lines.length &&
    (lines[i].trim() === "" || lines[i].trim().startsWith("%%"))
  ) {
    i++;
  }
  const header = lines[i];
  if (header === undefined) return source;
  const match = header.match(MERMAID_FLOW_HEADER);
  if (!match) return source;
  const rest = match[3];
  if (MERMAID_DIRECTION.test(rest)) return source;
  const direction = flow === "vertical" ? "TB" : "LR";
  lines[i] = `${match[1]}${match[2]} ${direction}${rest}`;
  return lines.join("\n");
}
