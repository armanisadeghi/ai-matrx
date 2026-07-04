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
import {
  additionalDetailsSection,
  collectExtras,
  extrasList,
  joinBlocks,
  isRecordValue,
} from "./kind-markdown-utils";

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

// ---------------------------------------------------------------------------
// toMarkdown facet — diagram_spec → a readable structure outline.
//
// The visual can't survive a text export, but the STRUCTURE can: a "Nodes"
// list (label, type, description) and an "Edges" list rendered as
// `source → target` with edge ids resolved to node labels. Purely-visual
// fields (position, colors, layout, renderHints) plus unknown keys land
// under "Additional details" / inline extras — present, not prominent.
// ---------------------------------------------------------------------------

const MD_NODE_KNOWN_KEYS = ["id", "label", "type", "description", "details"];
const MD_EDGE_KNOWN_KEYS = ["id", "source", "target", "label", "relationship"];
const MD_SPEC_KNOWN_KEYS = ["title", "description", "type", "nodes", "edges"];

function nodeMarkdownLine(node: Record<string, unknown>): string {
  const label =
    typeof node.label === "string" && node.label !== ""
      ? node.label
      : typeof node.id === "string"
        ? node.id
        : "?";
  const type =
    typeof node.type === "string" && node.type !== "" ? ` (${node.type})` : "";
  const description =
    typeof node.description === "string" && node.description !== ""
      ? ` — ${node.description}`
      : "";
  const details =
    typeof node.details === "string" && node.details !== ""
      ? ` — ${node.details}`
      : "";
  const parts = [`- **${label}**${type}${description}${details}`];
  const extras = extrasList(collectExtras(node, MD_NODE_KNOWN_KEYS));
  if (extras) parts.push(extras.replace(/^- /gm, "  - "));
  return parts.join("\n");
}

function edgeMarkdownLine(
  edge: Record<string, unknown>,
  labelById: Map<string, string>,
): string {
  const endpoint = (raw: unknown): string => {
    if (typeof raw !== "string" || raw === "") return "?";
    return labelById.get(raw) ?? raw;
  };
  const label =
    typeof edge.label === "string" && edge.label !== ""
      ? `: ${edge.label}`
      : "";
  const relationship =
    typeof edge.relationship === "string" && edge.relationship !== ""
      ? ` (${edge.relationship})`
      : "";
  const parts = [
    `- ${endpoint(edge.source)} → ${endpoint(edge.target)}${label}${relationship}`,
  ];
  const extras = extrasList(collectExtras(edge, MD_EDGE_KNOWN_KEYS));
  if (extras) parts.push(extras.replace(/^- /gm, "  - "));
  return parts.join("\n");
}

export function diagramMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const title =
    typeof value.title === "string" && value.title !== ""
      ? value.title
      : "Diagram";
  const nodes = Array.isArray(value.nodes)
    ? value.nodes.filter(isRecordValue)
    : [];
  const edges = Array.isArray(value.edges)
    ? value.edges.filter(isRecordValue)
    : [];

  const labelById = new Map<string, string>();
  for (const node of nodes) {
    if (typeof node.id === "string" && typeof node.label === "string") {
      labelById.set(node.id, node.label);
    }
  }

  return joinBlocks([
    `# ${title}`,
    typeof value.type === "string" && value.type !== ""
      ? `*${value.type} diagram*`
      : null,
    typeof value.description === "string" ? value.description : null,
    nodes.length > 0
      ? `## Nodes\n\n${nodes.map(nodeMarkdownLine).join("\n")}`
      : null,
    edges.length > 0
      ? `## Edges\n\n${edges
          .map((edge) => edgeMarkdownLine(edge, labelById))
          .join("\n")}`
      : null,
    // layout / renderHints / unknown keys — visual metadata, kept visible.
    additionalDetailsSection(collectExtras(value, MD_SPEC_KNOWN_KEYS)),
  ]);
}
