import { displayLabel } from "@ai-matrx/kit/text-case";

/**
 * An input as a person reads it: the provision's own label, else the name
 * humanized — never the raw `remaining_cards` / `organization_id`. A trailing
 * `_id` names a record, so it reads as that record ("Organization").
 */
export function inputDisplayLabel(input: { name: string; label?: string | null }): string {
  const explicit = input.label && input.label !== input.name ? input.label : null;
  if (explicit) return displayLabel(explicit, input.name);
  const base = input.name.replace(/_ids?$/, "");
  return displayLabel(undefined, base || input.name);
}
