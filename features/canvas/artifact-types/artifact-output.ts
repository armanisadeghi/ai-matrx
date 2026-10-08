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
 * canvas or a map prints blank — so each says how, or honestly that it cannot yet.
 */

import type { CanvasKind, CanvasKindSurface } from "@ai-matrx/canvas/react";
import type { CanvasContentType } from "@/features/canvas/canvasContent";
import { printPublishedPage } from "@/features/canvas/output/printPage";

export interface ArtifactOutputDef {
  readonly surface: CanvasKindSurface;
  readonly print?: CanvasKind["print"];
  readonly capture?: CanvasKind["capture"];
}

/** A frame type whose print/capture is not built yet (rendered-output standard P2). */
const NOT_YET = "not available yet";
const FRAME_NOT_YET: ArtifactOutputDef = { surface: "frame", print: NOT_YET, capture: NOT_YET };
const DOM: ArtifactOutputDef = { surface: "dom" };

export const ARTIFACT_OUTPUT: Record<CanvasContentType, ArtifactOutputDef> = {
  // An HTML page prints ITSELF (/p/<id>?print=1, vector, backgrounds kept). Its image comes from
  // the page capture engine (host output port) when one is plugged.
  html: {
    surface: "frame",
    print: (request) => printPublishedPage({ element: request.element }),
    capture: NOT_YET,
  },
  iframe: FRAME_NOT_YET,
  react: FRAME_NOT_YET,
  code_preview: FRAME_NOT_YET,
  map: FRAME_NOT_YET,
  sandbox: FRAME_NOT_YET,
  cloud_browser: FRAME_NOT_YET,
  udt_document: FRAME_NOT_YET,
  quiz: DOM,
  presentation: DOM,
  code: DOM,
  image: DOM,
  diagram: DOM,
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
  svg: DOM,
  chart: DOM,
  stats: DOM,
  diff: DOM,
  questionnaire: DOM,
  table: DOM,
  transcript: DOM,
  structured_info: DOM,
  tree: DOM,
  tasks: DOM,
  topical_map: DOM,
  kind_value: DOM,
};

export function artifactOutputDef(type: CanvasContentType): ArtifactOutputDef {
  return ARTIFACT_OUTPUT[type];
}
