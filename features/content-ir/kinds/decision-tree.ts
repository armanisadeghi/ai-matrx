/**
 * decision_tree kind → DecisionTreeBlock bridge.
 *
 * Successor to the legacy `{ decision_tree: { title, root } }` root-key
 * detection. The kind's authored shape is FLAT:
 *
 *   { __kind:"decision_tree", title, description?, root: {
 *       __kind:"decision_node", question?|action?, yes?, no?, ... } }
 *
 * DecisionTreeBlock consumes the PARSED `DecisionTreeData` (node ids
 * assigned, node types inferred) — not the raw JSON — so the bridge
 * reconstructs the zero-loss value, re-wraps it in the legacy root key, and
 * runs the component's OWN parser (`parseDecisionTreeJSON`). One parser,
 * exact parity with the raw-content path, no duplicated normalization.
 */

import { parseDecisionTreeJSON } from "@/components/mardown-display/blocks/decision-tree/parseDecisionTreeJSON";
import { makeCompleteEnvelopeBridge, isRecord } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  extrasList,
  formatInlineValue,
  joinBlocks,
} from "./kind-markdown-utils";

export const decisionTreeServerDataFromEnvelope = makeCompleteEnvelopeBridge(
  "decision_tree",
  (value) => {
    if (typeof value.title !== "string" || !isRecord(value.root)) {
      return undefined;
    }
    return parseDecisionTreeJSON(
      JSON.stringify({ decision_tree: value }),
    ) as unknown as Record<string, unknown>;
  },
);

// ---------------------------------------------------------------------------
// toMarkdown facet — decision_tree → a nested Yes/No bullet outline.
//
// Branch nodes render "**Question:** …" with **Yes:** / **No:** children
// nested one level deeper; leaves render "**Action:** …" with priority /
// category / estimated time in parentheses. Node-level unknown keys append
// as (key: value) on the node's line; tree-level unknown keys go under
// "Additional details".
// ---------------------------------------------------------------------------

const MD_NODE_KNOWN_KEYS = [
  "question",
  "action",
  "description",
  "priority",
  "category",
  "estimatedTime",
  "yes",
  "no",
];

const MD_TREE_KNOWN_KEYS = ["title", "description", "root"];

function nodeAnnotations(node: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof node.priority === "string" && node.priority !== "") {
    parts.push(`priority: ${node.priority}`);
  }
  if (typeof node.category === "string" && node.category !== "") {
    parts.push(`category: ${node.category}`);
  }
  if (typeof node.estimatedTime === "string" && node.estimatedTime !== "") {
    parts.push(`estimated time: ${node.estimatedTime}`);
  }
  const extras = collectExtras(node, MD_NODE_KNOWN_KEYS);
  for (const [key, value] of Object.entries(extras)) {
    parts.push(`${key}: ${formatInlineValue(value)}`);
  }
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

function nodeLines(node: Record<string, unknown>, depth: number): string[] {
  const pad = "  ".repeat(depth);
  const description =
    typeof node.description === "string" && node.description !== ""
      ? ` — ${node.description}`
      : "";
  const annotations = nodeAnnotations(node);

  if (typeof node.question === "string" && node.question !== "") {
    const lines = [
      `${pad}- **Question:** ${node.question}${description}${annotations}`,
    ];
    if (isRecord(node.yes)) {
      lines.push(`${pad}  - **Yes:**`);
      lines.push(...nodeLines(node.yes, depth + 2));
    }
    if (isRecord(node.no)) {
      lines.push(`${pad}  - **No:**`);
      lines.push(...nodeLines(node.no, depth + 2));
    }
    return lines;
  }

  const action = typeof node.action === "string" ? node.action : "";
  return [`${pad}- **Action:** ${action}${description}${annotations}`];
}

export function decisionTreeMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const title =
    typeof value.title === "string" && value.title !== ""
      ? value.title
      : "Decision tree";

  return joinBlocks([
    `# ${title}`,
    typeof value.description === "string" ? value.description : null,
    isRecord(value.root) ? nodeLines(value.root, 0).join("\n") : null,
    additionalDetailsSection(collectExtras(value, MD_TREE_KNOWN_KEYS)),
  ]);
}
