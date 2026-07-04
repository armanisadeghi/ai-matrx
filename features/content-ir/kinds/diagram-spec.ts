/**
 * diagram_spec kind → InteractiveDiagramBlock bridge.
 *
 * Successor to the legacy `{ diagram: { title, nodes, edges } }` root-key
 * detection. The kind's authored shape is FLAT:
 *
 *   { __kind:"diagram_spec", title, type?, nodes: [
 *       { __kind:"diagram_node", id, label, ... } ], edges: [
 *       { __kind:"diagram_edge", source, target, ... } ], layout?,
 *     renderHints? }
 *
 * InteractiveDiagramBlock consumes the PARSED `DiagramData` (positions
 * auto-generated, edge ids synthesized, from/to aliased to source/target),
 * so the bridge reconstructs the zero-loss value, re-wraps it in the legacy
 * root key, and runs the component's OWN parser (`parseDiagramJSON`).
 */

import { parseDiagramJSON } from "@/components/mardown-display/blocks/diagram/parseDiagramJSON";
import { makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";

export const diagramServerDataFromEnvelope = makeCompleteEnvelopeBridge(
  "diagram_spec",
  (value) => {
    if (typeof value.title !== "string" || !Array.isArray(value.nodes)) {
      return undefined;
    }
    return parseDiagramJSON(
      JSON.stringify({ diagram: value }),
    ) as unknown as Record<string, unknown>;
  },
);
