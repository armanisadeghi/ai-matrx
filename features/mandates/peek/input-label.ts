import { displayLabelForKey } from "@/features/agents/utils/variable-utils";

/**
 * An input as a person reads it: the provision's own label, else the name
 * humanized — never the raw `remaining_cards` / `organization_id`. A trailing
 * `_id` names a record, so it reads as that record ("Organization").
 */
export function inputDisplayLabel(input: { name: string; label?: string | null }): string {
  const explicit = input.label && input.label !== input.name ? input.label : null;
  if (explicit) return displayLabelForKey(input.name, explicit);
  const base = input.name.replace(/_ids?$/, "");
  return displayLabelForKey(base || input.name);
}
