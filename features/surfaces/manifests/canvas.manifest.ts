/**
 * Surface manifest — Canvas (`matrx-user/canvas`).
 *
 * Visual canvas / diagram editors. The user views or arranges canvas items
 * (diagram nodes, rendered artifacts, text blocks).
 *
 * Agents bound here operate on a selected node / text block (rewrite, expand)
 * or the whole canvas serialized as JSON (restructure, summarize the diagram).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "current_canvas_id",
    label: "Current canvas ID",
    description:
      "UUID of the canvas item currently open. Empty when none is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "current_canvas_type",
    label: "Current canvas type",
    description:
      'Kind of canvas content (e.g. "diagram", "mermaid", "artifact"). Empty when unknown or none is open.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 310,
  },
  {
    name: "selected_node_id",
    label: "Selected node ID",
    description:
      "ID of the single focused node/element on the canvas. Empty when nothing is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 320,
  },
  {
    name: "selected_nodes",
    label: "Selected nodes",
    description:
      "Array of `{ id, type, text }` for all currently-selected nodes. Empty array when nothing is selected.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 330,
  },
  {
    name: "current_text_block",
    label: "Current text block",
    description:
      "Text content of the focused node when it is a text element. Empty when the focused node has no text or nothing is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 340,
  },
  {
    name: "canvas_json",
    label: "Canvas as JSON",
    description:
      "The full canvas serialized as JSON (nodes, edges, layout). Empty object when none is open. Use for restructure / summarize-the-whole-diagram actions.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    sortOrder: 350,
  },
  {
    name: "render_mode",
    label: "Render mode",
    description:
      "Current canvas render mode (e.g. \"edit\", \"preview\"). Empty when none is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 360,
  },
  {
    name: "item_count",
    label: "Item count",
    description:
      "Total number of items / nodes on the canvas. Zero when empty or none is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 370,
  },
];

export const canvasManifest: SurfaceManifest = {
  surfaceName: "matrx-user/canvas",
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

export function createCanvasScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  current_canvas_id?: string;
  current_canvas_type?: string;
  selected_node_id?: string;
  selected_nodes?: Array<{ id: string; type?: string; text?: string }>;
  current_text_block?: string;
  canvas_json?: Record<string, unknown>;
  render_mode?: string;
  item_count?: number;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
