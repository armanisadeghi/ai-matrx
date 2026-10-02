import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
// features/kits/format.ts — counts said the way a person says them.

/** `count(1, "row")` → "1 row"; `count(7, "row")` → "7 rows"; irregulars via `many`. */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * An agent input's name as a person reads it: `model_selection_guidance` →
 * "Model Selection Guidance". The `{{name}}` syntax is authoring detail and never renders.
 */
export function variableLabel(name: string): string {
  return humanizeIdentifier(name) || "—";
}
