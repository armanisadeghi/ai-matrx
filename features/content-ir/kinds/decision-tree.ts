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
