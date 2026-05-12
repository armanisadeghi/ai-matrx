/**
 * features/page-extraction/utils/derive-variable-mapping.ts
 *
 * Inspect an agent's variable list and guess a sensible
 * `surface_key → agent_var_name` mapping so the user doesn't have to wire
 * every variable by hand on first use.
 *
 * The Python side reads this mapping per Job and routes each surface
 * variable (selection, content, filename, page_numbers, clean_text,
 * raw_text, …) to the agent variable name returned by `mapping[surface_key]`.
 *
 * Heuristics — applied to lowercased agent variable names:
 *   - contains "file" or "doc"    → filename
 *   - contains "page" + "number" or word "pages" → page_numbers
 *   - contains "text", "content", "selection", "input" → primary text
 *     (the first selected variation, e.g. clean_text)
 *     Also aliased to legacy `selection` / `content` keys so Phase-1 Jobs
 *     keep working.
 *
 * Anything that doesn't match a heuristic is left unmapped — the user
 * can review and tweak before saving.
 */

import type { SourceVariationKind } from "@/features/page-extraction/types";

export interface AgentVariableLike {
  name: string;
}

const FILE_PATTERN = /file|doc/i;
const PAGE_NUMBER_PATTERN = /^pages?$|page_?numbers?|pg_?num/i;
const TEXT_PATTERN = /text|content|selection|input|body|page_?content/i;

export function deriveVariableMapping(
  agentVariables: AgentVariableLike[] | null | undefined,
  selectedVariations: SourceVariationKind[],
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!agentVariables || agentVariables.length === 0) return out;

  const primaryTextSurface: SourceVariationKind =
    selectedVariations.includes("clean_text")
      ? "clean_text"
      : selectedVariations[0] ?? "clean_text";

  for (const v of agentVariables) {
    const name = (v?.name ?? "").trim();
    if (!name) continue;

    // Page number first — "page_number" must NOT be caught by the text
    // heuristic ("page_content" should map to text, not page_number).
    if (PAGE_NUMBER_PATTERN.test(name) && !/content/i.test(name)) {
      out.page_numbers = name;
      continue;
    }

    // File / document → filename
    if (FILE_PATTERN.test(name)) {
      out.filename = name;
      continue;
    }

    // Text-like → primary variation + back-compat aliases
    if (TEXT_PATTERN.test(name)) {
      out[primaryTextSurface] = name;
      out.selection = name;
      out.content = name;
      continue;
    }

    // No match — leave unmapped for the user to fix.
  }

  return out;
}
