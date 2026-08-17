/**
 * Canonical agent-mandate contract comparison — the ONE three-state
 * (matched / missing / extra) compare between what a mandate requires and what
 * a candidate agent declares. Absorbed from research's per-topic agents page
 * (the proven superset rule): the candidate must declare AT LEAST every
 * required variable name and context policy key; extras PASS — they are
 * informational only (the pipeline simply won't supply them).
 *
 * Two entry points, one core:
 * - `compareContracts` — full-declaration form: system agent's live
 *   `variableDefinitions` / `contextPolicies` vs the candidate's (rows carry
 *   type/helpText for rich display).
 * - `compareStoredContract` — stored-contract form: a mandate's persisted
 *   `{required_variables, required_context_slots}` (names only) vs the
 *   candidate's declared names. Same result shape, same rule.
 *
 * The server's bind-time check (aidream PUT /mandates/{mandate_key}/binding)
 * is the authority; this is the instant client-side pre-flight.
 */

import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import type { ContextPolicy } from "@/features/agents/types/agent-api-types";
import type { MandateContract } from "./overrides";

export interface ContractRow {
  name: string;
  type?: string;
  helpText?: string;
  required?: boolean;
}

export interface ComparisonResult {
  /** Variables required by the contract and present on the candidate. */
  matchedVariables: ContractRow[];
  /** Variables required by the contract but missing on the candidate. */
  missingVariables: ContractRow[];
  /** Variables on the candidate beyond the contract. Informational only. */
  extraVariables: ContractRow[];
  /** Same shape, but for context policies. */
  matchedPolicies: ContractRow[];
  missingPolicies: ContractRow[];
  extraPolicies: ContractRow[];
  /** True when nothing required is missing. Extras don't fail the check. */
  passing: boolean;
}

function variableToRow(v: VariableDefinition): ContractRow {
  return {
    name: v.name,
    helpText: v.helpText,
    required: v.required,
  };
}

function policyToRow(s: ContextPolicy): ContractRow {
  return {
    name: s.key,
    type: s.type,
    helpText: s.description,
  };
}

function diffRows(
  required: ContractRow[],
  candidate: ContractRow[],
): { matched: ContractRow[]; missing: ContractRow[]; extra: ContractRow[] } {
  const candidateNames = new Set(candidate.map((r) => r.name));
  const requiredNames = new Set(required.map((r) => r.name));
  const matched: ContractRow[] = [];
  const missing: ContractRow[] = [];
  for (const row of required) {
    if (candidateNames.has(row.name)) matched.push(row);
    else missing.push(row);
  }
  const extra = candidate.filter((r) => !requiredNames.has(r.name));
  return { matched, missing, extra };
}

/**
 * Compares a system agent's declared contract against the candidate's.
 * Rule: the candidate must declare **at least** every variable name and
 * context policy key the system agent declares. Extras pass.
 */
export function compareContracts(
  system: {
    variableDefinitions: VariableDefinition[] | null;
    contextPolicies: ContextPolicy[];
  },
  candidate: {
    variableDefinitions: VariableDefinition[] | null;
    contextPolicies: ContextPolicy[];
  },
): ComparisonResult {
  const vars = diffRows(
    (system.variableDefinitions ?? []).map(variableToRow),
    (candidate.variableDefinitions ?? []).map(variableToRow),
  );
  const slots = diffRows(
    (system.contextPolicies ?? []).map(policyToRow),
    (candidate.contextPolicies ?? []).map(policyToRow),
  );
  return {
    matchedVariables: vars.matched,
    missingVariables: vars.missing,
    extraVariables: vars.extra,
    matchedPolicies: slots.matched,
    missingPolicies: slots.missing,
    extraPolicies: slots.extra,
    passing: vars.missing.length === 0 && slots.missing.length === 0,
  };
}

/**
 * Same rule against a mandate's STORED contract (`parseMandateContract` output —
 * names only) and a candidate's declared names. The result rows carry names
 * without type/helpText; the shape is identical, so every renderer of
 * `ComparisonResult` works on either form.
 */
export function compareStoredContract(
  contract: MandateContract,
  candidate: { variableNames: string[]; contextPolicyKeys: string[] },
): ComparisonResult {
  const toRow = (name: string): ContractRow => ({ name });
  const vars = diffRows(
    contract.requiredVariables.map(toRow),
    candidate.variableNames.map(toRow),
  );
  const slots = diffRows(
    contract.requiredContextPolicyKeys.map(toRow),
    candidate.contextPolicyKeys.map(toRow),
  );
  return {
    matchedVariables: vars.matched,
    missingVariables: vars.missing,
    extraVariables: vars.extra,
    matchedPolicies: slots.matched,
    missingPolicies: slots.missing,
    extraPolicies: slots.extra,
    passing: vars.missing.length === 0 && slots.missing.length === 0,
  };
}

/** Returns just the contract rows for a system agent, for display. */
export function systemContractRows(system: {
  variableDefinitions: VariableDefinition[] | null;
  contextPolicies: ContextPolicy[];
}): { variables: ContractRow[]; slots: ContractRow[] } {
  return {
    variables: (system.variableDefinitions ?? []).map(variableToRow),
    slots: (system.contextPolicies ?? []).map(policyToRow),
  };
}
