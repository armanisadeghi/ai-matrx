/**
 * The Mandate CONTRACT, client-side — one leaf module so both the resolution
 * path (`service.ts`) and the binding-editor path (`overrides.ts`) read the
 * same shape without importing each other.
 *
 * 🚨 THE DOCUMENT-VARIABLE LAW (disease D4, Arman 2026-08-19). A Mandate's
 * `required_variables` are not decoration and not only a BIND-time check
 * against what the agent declares. They are also a RUN-time precondition on
 * what the CALLER supplies:
 *
 *   "this agent should never have even started without getting the rules in
 *    place."
 *
 * `missingRequiredVariables` is the one implementation of that check. A run
 * whose required variable is absent or blank REFUSES — there is no seed
 * fallback and no "the model can fetch it with a tool" consolation, because a
 * document that arrives by tool call is a document that gets skimmed.
 *
 * Law: `common-docs/systems/agent-variable-binding/FEATURE.md` § THE
 * USER-INPUT LAW · register: `common-docs/operations/agent-failure-diseases.md` § D4.
 */

import type { Json } from "@/types/database.types";
import { isJsonObject } from "@/types/json";

export interface MandateContract {
  requiredVariables: string[];
  requiredContextPolicyKeys: string[];
  requiredOutputKeys: string[];
  /**
   * Variables the contract deliberately delivers as user text instead of a
   * declared variable (Scenario 4). A spilled variable still ARRIVES, so it is
   * never counted as missing — but structured content may never take this
   * path.
   */
  spillVariables: string[];
}

export const EMPTY_MANDATE_CONTRACT: MandateContract = {
  requiredVariables: [],
  requiredContextPolicyKeys: [],
  requiredOutputKeys: [],
  spillVariables: [],
};

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function parseMandateContract(contract: Json): MandateContract {
  if (!isJsonObject(contract)) return { ...EMPTY_MANDATE_CONTRACT };
  return {
    requiredVariables: stringList(contract.required_variables),
    requiredContextPolicyKeys: stringList(contract.required_context_policies),
    requiredOutputKeys: stringList(contract.required_output_keys),
    spillVariables: stringList(contract.spill_variables),
  };
}

/**
 * Which of the Mandate's required variables the caller did NOT actually
 * supply. Blank counts as missing: a required document that resolved to an
 * empty string is the wiring failure this check exists to catch, and a
 * deliberately empty document must still say so in words (see
 * `features/masterwork/agent-context/rulebookDocument.ts`).
 *
 * Spilled variables are excluded — they arrive as user text, so they are
 * delivered, just not as a named variable.
 */
export function missingRequiredVariables(
  contract: MandateContract,
  supplied: Record<string, unknown> | null | undefined,
): string[] {
  const spilled = new Set(contract.spillVariables);
  return contract.requiredVariables.filter((name) => {
    if (spilled.has(name)) return false;
    const value = supplied?.[name];
    if (value === undefined || value === null) return true;
    if (typeof value === "string") return value.trim().length === 0;
    return false;
  });
}

/** The one refusal message, so every surface says the same thing. */
export function missingVariablesMessage(
  mandateKey: string,
  missing: string[],
): string {
  return (
    `The "${mandateKey}" step cannot start: it requires ` +
    `${missing.map((n) => `\`${n}\``).join(", ")}, and ` +
    `${missing.length === 1 ? "it was" : "they were"} not supplied. ` +
    `Refusing rather than starting the agent without ${missing.length === 1 ? "it" : "them"}.`
  );
}
