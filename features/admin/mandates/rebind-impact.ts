/**
 * Rebind pre-flight — "if I swap this mandate's agent, what stops flowing?"
 *
 * WHY THIS EXISTS (read before changing anything here):
 * `podcast.deep_research` broke because this console SUGGESTED a rebind (correctly
 * — THE SYSTEM-AGENT LAW) and then performed it without checking variables. The
 * new agent declared none of the variables the code passes, so the step silently
 * stopped receiving its input. A remedy this system offered is what broke the
 * run. An unchecked suggestion is worse than no suggestion.
 *
 * Cross-repo system-of-record:
 * /Users/armanisadeghi/code/common-docs/systems/agent-variable-binding/FEATURE.md
 * — the scenario matrix and the blocking rules live there, not here.
 *
 * THE BLOCKING RULE (doctrine, do not "tighten"): only a genuinely absent value
 * blocks. Renames, defaults, and deliberate blanks are non-breaking and must
 * save. Over-tightening is itself a defect — scream, don't block.
 *
 * TRUTH SOURCES, weakest to strongest:
 *   1. `mandate.contract.required_variables` — a DB copy, measured stale on 51 of
 *      143 mandates (2026-08-15). Never trusted alone.
 *   2. The CURRENTLY BOUND agent's declarations — what is demonstrably flowing
 *      right now. For a REBIND this is the strongest signal available on the
 *      client and needs no server round trip.
 *   3. aidream's code-truth API — what the call site actually passes. The
 *      console feeds it through `codeSuppliedVariables`; absent means the UI
 *      says truth is unavailable, never guesses.
 */

import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import type { components } from "@/types/python-generated/api-types";

type MandateCodeTruth = components["schemas"]["MandateCodeTruth"];

/** Per-variable verdict. Mirrors the cross-repo scenario matrix. */
export type RebindVerdict =
  /** The candidate declares it — keeps flowing. */
  | "ok"
  /** Candidate declares it and supplies a default; safe even if unsupplied. */
  | "default_available"
  /** Not declared under this name, but the candidate has a near-identical one —
   *  a rename mapping fixes it with no code change (Scenario 1). */
  | "rename_candidate"
  /** Flowing today, NOT declared by the candidate, no near match. THE BUG. */
  | "lost"
  /** Candidate requires something nothing supplies (Scenario 6/8). */
  | "unsupplied_required";

export interface RebindVariableImpact {
  name: string;
  verdict: RebindVerdict;
  /** For `rename_candidate` — the candidate variable this should map onto. */
  suggestedMapping?: string;
}

export interface RebindImpact {
  variables: RebindVariableImpact[];
  /** Verdicts that must be confirmed before the write proceeds. */
  breaking: RebindVariableImpact[];
  /** Non-breaking but worth stating (renames, defaults filling a gap). */
  cautions: RebindVariableImpact[];
  /** True when nothing stops flowing — the write is a clean swap. */
  clean: boolean;
  /**
   * True when we could not establish what flows today (the current agent's
   * declarations were unreadable). The UI must SAY this rather than render a
   * reassuring empty result — a silent "looks fine" here is the original bug.
   */
  indeterminate: boolean;
}

/** Loose match for a rename: case/underscore/hyphen-insensitive. */
function normalize(name: string): string {
  return name.toLowerCase().replace(/[\s_-]+/g, "");
}

/**
 * Compare what flows today against what a candidate agent declares.
 *
 * `currentVariables` = the bound agent's declarations (what flows now).
 * `candidateVariables` = the agent being rebound to.
 * `contractRequired` = the mandate's stored contract (weak; unions into "must flow").
 * `codeSuppliedVariables` = what the call site actually passes, when known.
 */
export function computeRebindImpact({
  currentVariables,
  candidateVariables,
  contractRequired = [],
  codeSuppliedVariables,
}: {
  currentVariables: VariableDefinition[] | null;
  candidateVariables: VariableDefinition[];
  contractRequired?: string[];
  codeSuppliedVariables?: string[];
}): RebindImpact {
  const candidateByName = new Map(candidateVariables.map((v) => [v.name, v]));
  const candidateByNormal = new Map(
    candidateVariables.map((v) => [normalize(v.name), v.name]),
  );

  // What SHOULD keep flowing: everything the current agent consumes, plus the
  // stored contract, plus (when known) what the code actually passes. Union,
  // because each source is individually incomplete.
  const mustFlow = new Set<string>();
  for (const v of currentVariables ?? []) mustFlow.add(v.name);
  for (const name of contractRequired) mustFlow.add(name);
  for (const name of codeSuppliedVariables ?? []) mustFlow.add(name);

  const variables: RebindVariableImpact[] = [];

  for (const name of mustFlow) {
    const exact = candidateByName.get(name);
    if (exact) {
      variables.push({ name, verdict: "ok" });
      continue;
    }
    const near = candidateByNormal.get(normalize(name));
    if (near) {
      variables.push({
        name,
        verdict: "rename_candidate",
        suggestedMapping: near,
      });
      continue;
    }
    variables.push({ name, verdict: "lost" });
  }

  // The other direction: the candidate demands something nobody supplies.
  for (const v of candidateVariables) {
    if (mustFlow.has(v.name)) continue;
    const hasDefault = v.defaultValue !== undefined && v.defaultValue !== null;
    if (v.required && !hasDefault) {
      variables.push({ name: v.name, verdict: "unsupplied_required" });
    } else if (hasDefault) {
      variables.push({ name: v.name, verdict: "default_available" });
    }
    // An optional variable with no default and no supplier is a non-event.
  }

  const breaking = variables.filter(
    (v) => v.verdict === "lost" || v.verdict === "unsupplied_required",
  );
  const cautions = variables.filter((v) => v.verdict === "rename_candidate");

  return {
    variables,
    breaking,
    cautions,
    clean: breaking.length === 0 && cautions.length === 0,
    indeterminate: currentVariables === null,
  };
}

/** Turn the live code-vs-bound-agent comparison into the SAME impact model the
 * rebind guard presents. This keeps the drawer, guard, and fix brief on one
 * vocabulary instead of inventing a second drift explanation. */
export function codeTruthRebindImpact(codeTruth: MandateCodeTruth): RebindImpact {
  const missing = new Set(codeTruth.bound_agent_missing_variables ?? []);
  const variables: RebindVariableImpact[] = codeTruth.code_variables.map(
    (name) => ({
      name,
      verdict: missing.has(name) ? "lost" : "ok",
    }),
  );
  const breaking = variables.filter((item) => item.verdict === "lost");
  return {
    variables,
    breaking,
    cautions: [],
    clean: breaking.length === 0,
    indeterminate: codeTruth.bound_agent_drift == null,
  };
}

/**
 * The copy-paste brief for the one case that genuinely needs code (Scenario 6).
 * Names the mandate, the exact mismatch, and the requirement to update every use —
 * per the doc's law that a breaking case ships a fix brief, never a refusal.
 */
export function buildRebindFixBrief({
  mandateKey,
  candidateName,
  impact,
  codeTruth,
}: {
  mandateKey: string;
  candidateName: string;
  impact: RebindImpact;
  codeTruth?: MandateCodeTruth;
}): string {
  const lost = impact.breaking
    .filter((v) => v.verdict === "lost")
    .map((v) => v.name);
  const unsupplied = impact.breaking
    .filter((v) => v.verdict === "unsupplied_required")
    .map((v) => v.name);
  const renames = impact.cautions
    .map((v) => `  - "${v.name}" -> "${v.suggestedMapping}"`)
    .join("\n");
  const source = codeTruth?.source;
  const callSites = codeTruth?.call_sites ?? [];
  const callSiteLines = callSites.length
    ? callSites
        .map(
          (site) =>
            `  - ${site.source_file}:${site.line}`,
        )
        .join("\n")
    : "  - No call sites were discovered in the registered source module.";

  return [
    `Fix the mandate "${mandateKey}" after a rebind to the agent "${candidateName}".`,
    ``,
    `Read first (it is the spec):`,
    `/Users/armanisadeghi/code/common-docs/systems/agent-variable-binding/FEATURE.md`,
    ``,
    `THE MISMATCH:`,
    lost.length
      ? `- These values are supplied to the mandate but the new agent declares NO variable for them, so they will not reach the prompt: ${lost.join(", ")}.`
      : `- (none lost)`,
    unsupplied.length
      ? `- The new agent REQUIRES these and nothing supplies them: ${unsupplied.join(", ")}.`
      : `- (nothing unsupplied)`,
    renames ? `\nLIKELY RENAMES (same meaning, different name):\n${renames}` : ``,
    codeTruth
      ? `\nLIVE CODE TRUTH:\n- Runner: ${source ? `${source.class_name} (${source.source_file}:${source.line})` : "declaration unavailable"}\n- Code supplies: ${codeTruth.code_variables.join(", ") || "none"}.\n- Bound agent declares: ${codeTruth.bound_agent?.declared_variables.join(", ") || "none"}.\n- This Mandate accepts user text: ${codeTruth.passes_user_input ? "yes" : "no"}.\n- Call sites:\n${callSiteLines}`
      : ``,
    ``,
    `WHAT TO DO — pick per variable, do not guess:`,
    `1. If it is only a NAME difference, add a mapping. Do NOT rename anything in code.`,
    `2. If the agent should own the variable, declare it on the agent (and update its prompt to use it).`,
    `3. If the value only needs to be SEEN, pass it in user_input as "Name: value" — mark it as a caution to clean up later.`,
    `4. If the value genuinely does not exist in the calling code path, write the code that supplies it.`,
    ``,
    `REQUIREMENTS:`,
    `- Update EVERY call site, not just the one you found first.`,
    `- Update the mandate contract and the agent definition together so code and DB agree.`,
    `- Re-run the mandate's validation and confirm the variables actually arrive in a live run.`,
  ]
    .filter(Boolean)
    .join("\n");
}
