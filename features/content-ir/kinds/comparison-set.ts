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
import {
  additionalDetailsSection,
  collectExtras,
  extrasList,
  formatInlineValue,
  isRecordValue,
  joinBlocks,
} from "./kind-markdown-utils";

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

// ---------------------------------------------------------------------------
// toMarkdown facet — comparison_set → a real markdown table.
//
// Criteria are rows, compared items are columns (the natural reading of the
// authored shape). Criterion annotations (type / weight / higherIsBetter +
// unknown keys) go into a "Criteria notes" list; set-level unknown keys go
// under "Additional details". Cell text pipes are escaped so authored values
// can't break the table.
// ---------------------------------------------------------------------------

const MD_CRITERION_KNOWN_KEYS = ["name", "values"];
const MD_SET_KNOWN_KEYS = ["title", "description", "items", "criteria"];

function tableCell(value: unknown): string {
  return formatInlineValue(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function comparisonMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const title =
    typeof value.title === "string" && value.title !== ""
      ? value.title
      : "Comparison";
  const items = Array.isArray(value.items) ? value.items : [];
  const criteria = Array.isArray(value.criteria)
    ? value.criteria.filter(isRecordValue)
    : [];

  const header = `| Criteria | ${items.map(tableCell).join(" | ")} |`;
  const divider = `| --- | ${items.map(() => "---").join(" | ")} |`;
  const rows = criteria.map((criterion) => {
    const name = tableCell(criterion.name ?? "");
    const values = Array.isArray(criterion.values) ? criterion.values : [];
    const cells = items.map((_, i) => tableCell(values[i] ?? ""));
    return `| ${name} | ${cells.join(" | ")} |`;
  });

  // Per-criterion annotations that don't fit table cells.
  const notes = criteria
    .map((criterion) => {
      const extras = collectExtras(criterion, MD_CRITERION_KNOWN_KEYS);
      const list = extrasList(extras);
      if (!list) return null;
      const name = typeof criterion.name === "string" ? criterion.name : "?";
      return `- **${name}:** ${Object.entries(extras)
        .map(([key, extra]) => `${key}: ${formatInlineValue(extra)}`)
        .join(", ")}`;
    })
    .filter((line): line is string => line !== null);

  return joinBlocks([
    `# ${title}`,
    typeof value.description === "string" ? value.description : null,
    items.length > 0 && criteria.length > 0
      ? [header, divider, ...rows].join("\n")
      : null,
    notes.length > 0 ? `**Criteria notes:**\n\n${notes.join("\n")}` : null,
    additionalDetailsSection(collectExtras(value, MD_SET_KNOWN_KEYS)),
  ]);
}
