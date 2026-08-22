/**
 * AUTO-GENERATED — DO NOT EDIT.
 * Source: aidream/services/mandates/provisions.py (the declare_provision registry)
 *         + matrx_ai.agents.named.OfferedValueMapping (the ONE mapping deserializer's model)
 * Regenerate: uv run python scripts/mandates_generate.py  (aidream repo; --dry-run also writes this file)
 *
 * A Provision is the ENTIRE declared input side of a mandate call site;
 * its whole offered shape is the registered kind `<provision_key>.offer`.
 * `user_input` is never an offered value — human text rides the envelope.
 */

/** JSON — pydantic's JsonValue. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface OfferedValue {
  name: string;
  kind: string;
  guaranteed?: boolean;
  lazy?: boolean;
  description?: string;
}

export interface OfferedValueMapping {
  mapType?: "offered_value";
  target: string;
  required?: boolean;
  deliver?: "variable" | "context";
  when_absent?: "skip" | "use_default" | "fail" | null;
  default?: JsonValue | null;
}

/** agent.mandate_binding.consumption_map — offered value name → how the bound Holder consumes it. */
export type ConsumptionMap = Record<string, OfferedValueMapping>;

/** provision_key → its whole offered shape. */
// No provisions declared yet — declare_provision(...) entries land here.
export interface ProvisionOffers {}

export type ProvisionKey = keyof ProvisionOffers;

/** provision_key → its registered derived input kind slug. */
export const PROVISION_OFFER_KINDS = {
} as const;
