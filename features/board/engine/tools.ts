/**
 * Spatial view — the tool bar's tools and their keys (Figma / FigJam / Claude
 * Design conventions, so hands already know them).
 */

export type SpatialTool =
  | "select"
  | "hand"
  | "text"
  | "frame"
  | "note"
  | "pen"
  | "rect"
  | "oval"
  | "arrow"
  | "line";

export type ShapeTool = Extract<SpatialTool, "rect" | "oval" | "arrow" | "line">;

export const SHAPE_TOOLS: readonly ShapeTool[] = ["rect", "oval", "arrow", "line"];

export const TOOL_LABEL: Record<SpatialTool, string> = {
  select: "Select",
  hand: "Hand",
  text: "Text",
  frame: "Frame",
  note: "Note",
  pen: "Draw",
  rect: "Rectangle",
  oval: "Oval",
  arrow: "Arrow",
  line: "Line",
};

/** Key shown in tooltips and menus. */
export const TOOL_KEY: Record<SpatialTool, string> = {
  select: "V",
  hand: "H",
  text: "T",
  frame: "F",
  note: "N",
  pen: "P",
  rect: "R",
  oval: "O",
  arrow: "⇧L",
  line: "L",
};

/** Map a keydown to a tool, or null. */
export function toolForKey(e: { key: string; shiftKey: boolean }): SpatialTool | null {
  const k = e.key.toLowerCase();
  if (e.shiftKey) return k === "l" ? "arrow" : null;
  switch (k) {
    case "v":
      return "select";
    case "h":
      return "hand";
    case "t":
      return "text";
    case "f":
      return "frame";
    case "n":
      return "note";
    case "p":
      return "pen";
    case "r":
      return "rect";
    case "o":
      return "oval";
    case "l":
      return "line";
    default:
      return null;
  }
}

/** Tools that create something where you click or drag. */
export function isCreationTool(t: SpatialTool): boolean {
  return t !== "select" && t !== "hand";
}
