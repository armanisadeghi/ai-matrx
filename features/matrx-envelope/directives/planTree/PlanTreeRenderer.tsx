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

import { EnvelopeFallbackCard } from "@/features/matrx-envelope/EnvelopeFallbackCard";
import type { EnvelopeRendererProps } from "@/features/matrx-envelope/registry";

import { parsePlanTreeItems } from "./parseDirectiveItems";
import { useResolvePlanTree } from "./useResolvePlanTree";
import type { PlanTreeDirectiveItem } from "./types";
import { PlanTreePreview } from "./PlanTreePreview";

/** Wraps one item: resolves whether it is already live, then renders the
 *  full drillable preview. The preview is the approval surface — see
 *  PlanTreePreview for why the payload is never hidden from the user. */
function PlanTreeItem({
  item,
  envelope,
}: {
  item: PlanTreeDirectiveItem;
  envelope: EnvelopeRendererProps["envelope"];
}) {
  const { status, data } = useResolvePlanTree(item);
  const applied = status === "resolved" && !!data;
  return <PlanTreePreview item={item} envelope={envelope} applied={applied} />;
}

const PlanTreeRenderer = ({ envelope }: EnvelopeRendererProps) => {
  const items = parsePlanTreeItems(envelope);
  // NEVER return null — that deletes the whole message block (see
  // EnvelopeFallbackCard). Degrade visibly instead.
  if (items.length === 0) {
    return (
      <EnvelopeFallbackCard
        envelope={envelope}
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
          envelope={envelope}
        />
      ))}
    </>
  );
};

export default PlanTreeRenderer;
