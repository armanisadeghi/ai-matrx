// features/kits/format.ts — counts said the way a person says them.

/** `count(1, "row")` → "1 row"; `count(7, "row")` → "7 rows"; irregulars via `many`. */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * An agent input's name as a person reads it: `model_selection_guidance` →
 * "Model selection guidance". The `{{name}}` syntax is authoring detail and never renders.
 */
export function variableLabel(name: string): string {
  const words = name.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "—";
}
