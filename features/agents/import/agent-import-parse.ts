import { flexibleJsonParse } from "@/utils/json/json-utils";
import type { ParseResult } from "./import-types";

/**
 * Robustly parses whatever the user pastes.
 *
 * Strategy order:
 *   1. Trim + early-exit on empty
 *   2. Strip markdown code fences (```json, ```python, ``` etc.)
 *   3. JSON.parse(trimmed)
 *   4. flexibleJsonParse (Python literals, unquoted keys, trailing commas)
 *   5. Extract first {...} block (handles pasted prose around the JSON)
 */
export function parsePasted(raw: string): ParseResult {
  const warnings: string[] = [];

  if (!raw || !raw.trim()) {
    return {
      success: false,
      error: "Nothing was pasted. Use the text area to paste a JSON object.",
      warnings,
    };
  }

  let text = raw.trim();

  const fenceRe = /^```[\w]*\n?([\s\S]*?)\n?```$/;
  const fenceMatch = fenceRe.exec(text);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
    warnings.push("Stripped markdown code fences.");
  }

  try {
    const data = JSON.parse(text);
    return { success: true, data, warnings };
  } catch {
    // continue
  }

  const flexible = flexibleJsonParse(text);
  if (flexible.success) {
    warnings.push(...(flexible.warnings ?? []));
    return { success: true, data: flexible.data, warnings };
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    try {
      const data = JSON.parse(candidate);
      warnings.push("Extracted JSON block from surrounding text.");
      return { success: true, data, warnings };
    } catch {
      const flex2 = flexibleJsonParse(candidate);
      if (flex2.success) {
        warnings.push(
          "Extracted JSON block from surrounding text.",
          ...(flex2.warnings ?? []),
        );
        return { success: true, data: flex2.data, warnings };
      }
    }
  }

  return {
    success: false,
    error: `Could not parse as JSON. Tried standard JSON, Python-style literals, and loose key formatting. Original parse error: ${flexible.error ?? "Unknown parse error"}. Check for mismatched brackets or invalid string escaping.`,
    warnings,
  };
}
