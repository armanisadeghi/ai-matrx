/**
 * Where an agent app's "Open in canvas" sends its answer (kind-never-raw S5).
 *
 *  - The answer IS (or carries) a kind the artifact registry materializes →
 *    open it as that kind: `detectKindInJsonText`, the same detection
 *    `planMaterialization` uses, names the canvas type.
 *  - It carries a kind with no canvas artifact type → its readable markdown
 *    (`kindTextToMarkdown`); the caller renders that, never the JSON.
 *  - Kindless → the HTML canvas, unchanged.
 */

import { detectKindInJsonText } from "@/features/canvas/artifact-types/storedKindValue";
import type { CanvasContentType } from "@/features/canvas/canvasContent";
import { findEmbeddedKindJsonRegions } from "@/features/content-ir/surfaces/embedded-kind-json";
import { hasKindKey } from "@/features/content-ir/surfaces/json-kind-signal";
import { kindTextToMarkdown } from "@/features/content-ir/surfaces/kind-text-to-markdown";
import { deriveInstanceTitle } from "@/features/content-ir/studio/instance-title";

export type ResponseCanvasTarget =
  | {
      mode: "kind";
      canvasType: CanvasContentType;
      title: string;
      /** The kind's JSON text — the artifact body (the data keeps `__kind`). */
      content: string;
      structured: Record<string, unknown>;
    }
  | { mode: "markdown"; markdown: string }
  | { mode: "html"; html: string };

export function responseCanvasTarget(
  response: string,
  fallbackTitle: string,
): ResponseCanvasTarget {
  if (!hasKindKey(response)) return { mode: "html", html: response };
  const candidates = [
    response.trim(),
    ...findEmbeddedKindJsonRegions(response).map((region) => region.content),
  ];
  for (const candidate of candidates) {
    const hit = detectKindInJsonText(candidate);
    if (hit) {
      return {
        mode: "kind",
        canvasType: hit.def.canvasType,
        title: deriveInstanceTitle(hit.structured) ?? fallbackTitle,
        content: candidate,
        structured: hit.structured,
      };
    }
  }
  return { mode: "markdown", markdown: kindTextToMarkdown(response) };
}
