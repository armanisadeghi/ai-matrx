"use client";

/**
 * Chat renderer for `output_directive:plan_tree` envelopes.
 *
 * Position decides capability (MATRX_ENVELOPE.md): content NEVER auto-applies.
 * But "does not auto-apply" is not "inert" — when the server has not already
 * applied the tree, this renders the full approval surface (PlanTreePreview)
 * with a one-click Apply. When the tree IS already live, the same surface
 * shows it as applied. It read-only polls the plan schema to tell those apart
 * and NEVER claims to be applying something.
 */

import { DirectiveFallbackCard } from "@ai-matrx/content-ir-react";
import type { DirectiveRendererProps } from "@ai-matrx/content-ir-react";

import { parsePlanTreeItems } from "./parseDirectiveItems";
import { useResolvePlanTree } from "./useResolvePlanTree";
import type { PlanTreeDirectiveItem } from "./types";
import { PlanTreePreview } from "./PlanTreePreview";

/** Wraps one item: resolves whether it is already live, then renders the
 *  full drillable preview. The preview is the approval surface — see
 *  PlanTreePreview for why the payload is never hidden from the user. */
function PlanTreeItem({
  item,
  directive,
}: {
  item: PlanTreeDirectiveItem;
  directive: DirectiveRendererProps["directive"];
}) {
  const { status, data } = useResolvePlanTree(item);
  const applied = status === "resolved" && !!data;
  return <PlanTreePreview item={item} directive={directive} applied={applied} />;
}

const PlanTreeRenderer = ({ directive }: DirectiveRendererProps) => {
  const items = parsePlanTreeItems(directive);
  // NEVER return null — that deletes the whole message block (see
  // DirectiveFallbackCard). Degrade visibly instead.
  if (items.length === 0) {
    return (
      <DirectiveFallbackCard
        directive={directive}
        reason="no readable plan items"
      />
    );
  }
  return (
    <>
      {items.map((item, index) => (
        <PlanTreeItem
          key={`${item.site_id ?? item.site ?? "site"}:${index}`}
          item={item}
          directive={directive}
        />
      ))}
    </>
  );
};

export default PlanTreeRenderer;
