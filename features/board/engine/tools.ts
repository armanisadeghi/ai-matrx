/**
 * Board — the tool bar's tools and their keys (Figma / FigJam / Claude
 * Design conventions, so hands already know them).
 */

export type BoardTool =
  | "select"
  | "hand"
  | "text"
  | "frame"
  | "sticky"
  | "pen"
  | "eraser"
  | "rect"
  | "rounded"
  | "oval"
  | "triangle"
  | "diamond"
  | "star"
  | "arrow"
  | "line";

export type ShapeTool = Extract<BoardTool, "rect" | "rounded" | "oval" | "triangle" | "diamond" | "star" | "arrow" | "line">;

export const SHAPE_TOOLS: readonly ShapeTool[] = ["rect", "rounded", "oval", "triangle", "diamond", "star", "arrow", "line"];

export const TOOL_LABEL: Record<BoardTool, string> = {
  select: "Select",
  hand: "Hand",
  text: "Text",
  frame: "Frame",
  sticky: "Sticky note",
  pen: "Draw",
  eraser: "Eraser",
  rect: "Rectangle",
  rounded: "Rounded rectangle",
  oval: "Oval",
  triangle: "Triangle",
  diamond: "Diamond",
  star: "Star",
  arrow: "Arrow",
  line: "Line",
};

/** Key shown in tooltips and menus. */
export const TOOL_KEY: Record<BoardTool, string> = {
  select: "V",
  hand: "H",
  text: "T",
  frame: "F",
  sticky: "S",
  pen: "P",
  eraser: "E",
  rect: "R",
  rounded: "",
  oval: "O",
  triangle: "",
  diamond: "",
  star: "",
  arrow: "⇧L",
  line: "L",
};

/** Map a keydown to a tool, or null. */
export function toolForKey(e: { key: string; shiftKey: boolean }): BoardTool | null {
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
    case "s":
      return "sticky";
    case "p":
      return "pen";
    case "e":
      return "eraser";
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
export function isCreationTool(t: BoardTool): boolean {
  return t !== "select" && t !== "hand";
}
