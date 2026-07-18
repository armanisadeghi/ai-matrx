import type { Resource } from "@/features/agents/resources/types";
import { buildContextValueReferenceFence } from "@/features/matrx-envelope/compoundReference";
import type { PickNode } from "@/features/scopes/components/active-context/quick-pick/engine";

/** Turn a Drill Deck leaf into the live reference resource Smart Input owns. */
export function contextValueResourceFromNode(
  node: PickNode,
): Extract<Resource, { type: "context_value" }> | null {
  if (node.kind !== "item" || !node.scopeId || !node.contextItemId) {
    return null;
  }

  const scopeName = node.path.at(-1);
  const label = scopeName ? `${scopeName} · ${node.label}` : node.label;
  return {
    type: "context_value",
    data: {
      id: `${node.scopeId}::${node.contextItemId}`,
      scope_id: node.scopeId,
      context_item_id: node.contextItemId,
      label,
      scope_name: scopeName,
      context_item_name: node.label,
      referenceFence: buildContextValueReferenceFence({
        scopeId: node.scopeId,
        contextItemId: node.contextItemId,
        label,
      }),
    },
  };
}
