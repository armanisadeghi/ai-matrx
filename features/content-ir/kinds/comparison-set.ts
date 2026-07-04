/**
 * comparison_set kind → ComparisonTableBlock bridge.
 *
 * Successor to the legacy `{ comparison: { title, items, criteria } }`
 * root-key detection. The kind's authored shape is FLAT:
 *
 *   { __kind:"comparison_set", title, description?, items: string[],
 *     criteria: [ { __kind:"comparison_criterion", name, values, type?,
 *       weight?, higherIsBetter? } ] }
 *
 * ComparisonTableBlock consumes the PARSED `ComparisonTableData` (criterion
 * types inferred, values normalized, weights defaulted), so the bridge
 * reconstructs the zero-loss value — `values` arrays that carry numbers or
 * booleans survive via the residue merge even when the string[]-declared
 * schema demoted that criterion node to raw — re-wraps it in the legacy root
 * key, and runs the component's OWN parser (`parseComparisonJSON`).
 */

import { parseComparisonJSON } from "@/components/mardown-display/blocks/comparison/parseComparisonJSON";
import { makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";

export const comparisonServerDataFromEnvelope = makeCompleteEnvelopeBridge(
  "comparison_set",
  (value) => {
    if (
      typeof value.title !== "string" ||
      !Array.isArray(value.items) ||
      !Array.isArray(value.criteria)
    ) {
      return undefined;
    }
    return parseComparisonJSON(
      JSON.stringify({ comparison: value }),
    ) as unknown as Record<string, unknown>;
  },
);
