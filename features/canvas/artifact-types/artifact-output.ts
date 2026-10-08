/**
 * The rendered-output half of every artifact TYPE: what its body is
 * (`surface`) and, for frame bodies, how it prints and captures — one entry
 * per canvas content type, used by the canvas tab (artifactKinds) and, through
 * the block-printer registry (artifact-printers), by the chat block and the
 * message's Print. The Record makes it exhaustive: a new type without an entry
 * is a type error.
 *
 * "dom" types print and capture through the host's DOM engines (or their
 * registered printer). "frame" types never do — a DOM copy of an iframe, a
 * canvas or a map prints blank — so each says how (output/frameKindOutputs), or honestly why not.
 */

import type { CanvasKind, CanvasKindSurface } from "@ai-matrx/canvas/react";
import type { CanvasContentType } from "@/features/canvas/canvasContent";
import { printPublishedPage } from "@/features/canvas/output/printPage";
import { contentOf, readArtifactItemData } from "@/features/canvas/host/artifactItem";
import { readArtifactPointerId } from "@/features/canvas/artifact-types/artifactId";
import {
  captureHtmlArtifact,
  CLOUD_BROWSER_OUTPUT,
  CODE_PREVIEW_OUTPUT,
  IFRAME_OUTPUT,
  MAP_OUTPUT,
  SANDBOX_OUTPUT,
  UDT_DOCUMENT_OUTPUT,
} from "@/features/canvas/output/frameKindOutputs";
import {
  CHART_OUTPUT,
  GRAPH_OUTPUT,
  IMAGE_OUTPUT,
  PRESENTATION_OUTPUT,
  SVG_OUTPUT,
} from "@/features/canvas/output/pictureKindPrinters";

export interface ArtifactOutputDef {
  readonly surface: CanvasKindSurface;
  readonly print?: CanvasKind["print"];
  readonly capture?: CanvasKind["capture"];
}

const DOM: ArtifactOutputDef = { surface: "dom" };

/** The canvas_items id an artifact tab was saved as (null while unsaved). */
function canvasItemIdOf(itemData: Parameters<typeof readArtifactItemData>[0]): string | null {
  const data = readArtifactItemData(itemData);
  if (!data) return null;
  const content = contentOf(data);
  return content.metadata?.canvasItemId ?? data.savedItemId ?? readArtifactPointerId(content.data) ?? null;
}

export const ARTIFACT_OUTPUT: Record<CanvasContentType, ArtifactOutputDef> = {
  // An HTML page prints ITSELF (/p/<id>?print=1, vector, backgrounds kept). Its image comes from
  // the page capture engine (host output port) when one is plugged.
  html: {
    surface: "frame",
    // The tab shows the chain's latest version; print that version's own page.
    print: (request) => printPublishedPage({ canvasItemId: canvasItemIdOf(request.item.data), version: "latest" }),
    // The server's real browser renders the published page at the viewer's width.
    capture: captureHtmlArtifact,
  },
  // An external site: its pixels belong to another origin and the capture engine takes record
  // ids, never client URLs — honest reasons, plus "Open site" in the menu (artifactKinds).
  iframe: { surface: "frame", ...IFRAME_OUTPUT },
  // Compiled and run in-app (ReactCodeBlock) — same-origin DOM.
  react: DOM,
  // A diff of code (CodePreviewCanvas) — same-origin DOM; Print prints the proposed code in full.
  code_preview: { surface: "dom", ...CODE_PREVIEW_OUTPUT },
  // Leaflet: tiles from another origin taint a DOM copy — drawn tile by tile (mapCapture).
  map: { surface: "frame", ...MAP_OUTPUT },
  // Terminal, files and activity are DOM; Print reads the terminal's scrollback as text.
  sandbox: { surface: "dom", ...SANDBOX_OUTPUT },
  // A live stream in a frame: its latest screenshot is the picture (the body offers it).
  cloud_browser: { surface: "frame", ...CLOUD_BROWSER_OUTPUT },
  // Univer draws on a canvas: the body prints the document's text and captures its page.
  udt_document: { surface: "frame", ...UDT_DOCUMENT_OUTPUT },
  quiz: DOM,
  // Every slide, one picture per page (not only the slide on screen).
  presentation: { surface: "dom", ...PRESENTATION_OUTPUT },
  code: DOM,
  // The file itself, read through the file funnel (a DOM copy of a cross-origin image taints).
  image: { surface: "dom", ...IMAGE_OUTPUT },
  // React Flow paints only its viewport: print and capture draw the WHOLE graph.
  diagram: { surface: "dom", ...GRAPH_OUTPUT },
  comparison: DOM,
  timeline: DOM,
  research: DOM,
  troubleshooting: DOM,
  "decision-tree": DOM,
  flashcards: DOM,
  recipe: DOM,
  resources: DOM,
  code_edit_error: DOM,
  progress: DOM,
  math_problem: DOM,
  mermaid: DOM,
  // Drawn inside a sandboxed frame — a DOM copy is blank; the markup itself is the picture.
  svg: { surface: "frame", ...SVG_OUTPUT },
  chart: { surface: "dom", ...CHART_OUTPUT },
  stats: DOM,
  diff: DOM,
  questionnaire: DOM,
  table: DOM,
  transcript: DOM,
  structured_info: DOM,
  tree: DOM,
  tasks: DOM,
  // The map workspace is React Flow too: the whole graph, when the graph view is showing.
  topical_map: { surface: "dom", ...GRAPH_OUTPUT },
  kind_value: DOM,
};

export function artifactOutputDef(type: CanvasContentType): ArtifactOutputDef {
  return ARTIFACT_OUTPUT[type];
}
