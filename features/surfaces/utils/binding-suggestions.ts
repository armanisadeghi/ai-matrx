/**
 * binding-suggestions — pure core for the quick-bind "AI map" flow.
 *
 * The `surfaces_client.binding_mapper` mandate agent receives the surface's
 * declared values + write targets and the target agent's input contract
 * (variables AND context policies — the context-mandate doctrine is written into
 * the agent's DB definition), and returns a structured proposal. This module
 * owns both directions of that wire:
 *
 *   buildMapperVariables()  — surface/agent state → the agent's variables
 *   parseMapperResult()     — accumulated run text → validated suggestions
 *   suggestionsToMappings() — accepted suggestions → the canonical
 *                             ValueMappingMap the bind save already speaks
 *
 * Everything here is pure and synchronous so it is trivially testable; the
 * mandate run itself stays in the panel (the mandate door, via
 * useHeadlessAgentJson).
 */

import { extractFirstJson } from "@/utils/json/extract-json";
import { formatVariableDisplayName } from "@/features/agents/utils/variable-utils";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import type {
  SurfaceValue,
  SurfaceWriteTarget,
  ValueMapping,
  ValueMappingMap,
  WritePolicyMap,
} from "@/features/surfaces/types";
import { isSurfaceWritePolicy } from "@/features/surfaces/types";

// ---------------------------------------------------------------------------
// Payload building
// ---------------------------------------------------------------------------

export interface MapperAgentInfo {
  name: string;
  description?: string | null;
  variableDefinitions: AgentDefinition["variableDefinitions"];
  contextPolicies: AgentDefinition["contextPolicies"];
}

/** Build the mapper mandate's variable payload from live client state. */
export function buildMapperVariables(args: {
  surfaceName: string;
  surfaceLabel: string;
  agent: MapperAgentInfo;
  surfaceValues: SurfaceValue[];
  writeTargets: readonly SurfaceWriteTarget[];
  /**
   * D18.2 — the call site's own rule about combining values, in the words the
   * mapper reads. A surface binding stores one value per input; a mandate
   * consumption map stores an ordered list. The mapper is ONE agent serving
   * both, so the rule is an input, never a second agent.
   */
  combinationRule?: string;
}): Record<string, string> {
  const values = args.surfaceValues.map((v) => ({
    name: v.name,
    label: v.label,
    description: v.description,
    value_type: v.valueType,
    always_available: v.alwaysAvailable,
    typical_char_count: v.typicalCharCount,
    auto_context: v.autoContext ?? true,
    group: v.group ?? "general",
  }));
  const targets = args.writeTargets.map((t) => ({
    name: t.name,
    label: t.label,
    description: t.description,
    value_type: t.valueType,
    mode: t.mode,
    apply_policy: t.applyPolicy ?? "manual",
    updates_value: t.updatesValue ?? null,
  }));
  const contract = [
    ...(args.agent.variableDefinitions ?? []).map((v) => ({
      name: v.name,
      kind: "variable" as const,
      label: v.name,
      description: v.helpText ?? "",
      required: v.required ?? false,
      default_value: v.defaultValue ?? null,
    })),
    ...(args.agent.contextPolicies ?? []).map((s) => ({
      name: s.key,
      kind: "context_slot" as const,
      label: s.label ?? s.key,
      description: s.description ?? "",
      required: false,
      default_value: null,
    })),
  ];
  return {
    surface_name: args.surfaceName,
    surface_label: args.surfaceLabel,
    surface_values_json: JSON.stringify(values),
    write_targets_json: JSON.stringify(targets),
    agent_name: args.agent.name,
    agent_description: args.agent.description ?? "",
    agent_contract_json: JSON.stringify(contract),
    combination_rule:
      args.combinationRule ??
      "Exactly one value per input — never return surface_values.",
  };
}

// ---------------------------------------------------------------------------
// Result parsing
// ---------------------------------------------------------------------------

export type SuggestionConfidence = "high" | "medium" | "low";

export interface BindingSuggestion {
  /** Agent variable name or context-mandate key. */
  target: string;
  mapping: ValueMapping;
  /**
   * 🚨 D18.2 — MANY-TO-ONE. Extra source names, in order, that are joined into
   * this SAME input after `mapping` (blank line between them). Empty unless the
   * caller asked for many-to-one AND the model proposed a combination.
   *
   * A surface binding takes one value per input, so the surface call site never
   * asks for this and any extra the model emits is discarded WITH A REPORT —
   * the same discard-and-report contract every other invention gets (P12).
   */
  alsoFrom: string[];
  confidence: SuggestionConfidence;
  reason: string;
}

export interface WritePolicySuggestion {
  target: string;
  policy: WritePolicyMap[string];
  reason: string;
}

export interface MapperProposal {
  suggestions: BindingSuggestion[];
  writePolicies: WritePolicySuggestion[];
  notes: string;
  /** Entries the model emitted that failed validation — surfaced, never silent. */
  discarded: string[];
}

function isConfidence(v: unknown): v is SuggestionConfidence {
  return v === "high" || v === "medium" || v === "low";
}

/**
 * Parse + validate the mapper agent's output.
 *
 * Validation is structural AND referential: a mapping naming an unknown agent
 * input, or a surface_value not declared on the surface, is discarded and
 * reported — the model never gets to invent a name that then fails at launch.
 */
export function parseMapperResult(args: {
  raw: string;
  validTargets: ReadonlySet<string>;
  validSurfaceValues: ReadonlySet<string>;
  validWriteTargets: ReadonlySet<string>;
  /** The domain's word for one offered/declared value, for the discard report
   * ("page value" on a surface, "offered value" on a job). */
  sourceNoun?: string;
  /**
   * D18.2 — may several values feed ONE input (joined with a blank line)?
   * A mandate consumption map says yes; a surface binding says no, and every
   * extra source the model proposes is discarded and reported rather than
   * silently dropped or silently applied.
   */
  allowManyToOne?: boolean;
}): MapperProposal | null {
  const extracted = extractFirstJson(args.raw, { allowFuzzy: true });
  const root = extracted?.value;
  if (!root || typeof root !== "object" || Array.isArray(root)) return null;
  const obj = root as Record<string, unknown>;

  const sourceNoun = args.sourceNoun ?? "page value";
  const discarded: string[] = [];
  const suggestions: BindingSuggestion[] = [];
  const seen = new Set<string>();

  const rawMappings = Array.isArray(obj.mappings) ? obj.mappings : [];
  for (const entry of rawMappings) {
    if (!entry || typeof entry !== "object") continue;
    const m = entry as Record<string, unknown>;
    const target = typeof m.target === "string" ? m.target : null;
    const mapType = typeof m.map_type === "string" ? m.map_type : null;
    if (!target || !mapType) continue;
    if (!args.validTargets.has(target)) {
      discarded.push(`"${target}" is not one of this agent's inputs`);
      continue;
    }
    if (seen.has(target)) {
      discarded.push(`duplicate decision for "${target}"`);
      continue;
    }

    let mapping: ValueMapping | null = null;
    let alsoFrom: string[] = [];
    if (mapType === "surface_value") {
      // D18.2 — the model may answer with ONE `surface_value` or an ORDERED
      // `surface_values` list. Both funnel here: element 0 is the row's own
      // source, the rest are the joined extras.
      const listed = Array.isArray(m.surface_values)
        ? m.surface_values.filter((v): v is string => typeof v === "string")
        : [];
      const named = typeof m.surface_value === "string" ? [m.surface_value] : [];
      const proposed = listed.length > 0 ? listed : named;
      const known: string[] = [];
      for (const name of proposed) {
        if (args.validSurfaceValues.has(name)) known.push(name);
        else
          discarded.push(
            `"${target}" pointed at "${name}", which is not a ${sourceNoun} here`,
          );
      }
      const sv = known[0] ?? null;
      if (!sv) {
        if (proposed.length === 0) {
          discarded.push(`"${target}" named no ${sourceNoun} to take`);
        }
        continue;
      }
      const extras = known.slice(1);
      if (extras.length > 0) {
        if (args.allowManyToOne) alsoFrom = extras;
        else
          discarded.push(
            `"${target}" asked for ${extras.length + 1} values at once (${known.join(" + ")}) — a binding here takes one value per input, so only "${sv}" was kept`,
          );
      }
      mapping = {
        mapType: "surface_value",
        target: sv,
        required: m.required === true,
      };
    } else if (mapType === "direct_value") {
      if (m.direct_value === null || m.direct_value === undefined) {
        discarded.push(`"${target}" had a fixed value with no value`);
        continue;
      }
      mapping = { mapType: "direct_value", target: m.direct_value };
    } else if (mapType === "prompt_user") {
      const prompt = typeof m.prompt === "string" ? m.prompt.trim() : "";
      if (!prompt) {
        discarded.push(`"${target}" asked the user with no question`);
        continue;
      }
      mapping = {
        mapType: "prompt_user",
        prompt,
        required: m.required === true,
      };
    } else if (mapType === "unmapped") {
      mapping = { mapType: "unmapped" };
    } else {
      discarded.push(`"${target}" used unknown decision "${mapType}"`);
      continue;
    }

    seen.add(target);
    suggestions.push({
      target,
      mapping,
      alsoFrom,
      confidence: isConfidence(m.confidence) ? m.confidence : "low",
      reason: typeof m.reason === "string" ? m.reason : "",
    });
  }

  const writePolicies: WritePolicySuggestion[] = [];
  const rawPolicies = Array.isArray(obj.write_policy_suggestions)
    ? obj.write_policy_suggestions
    : [];
  for (const entry of rawPolicies) {
    if (!entry || typeof entry !== "object") continue;
    const p = entry as Record<string, unknown>;
    const target = typeof p.target === "string" ? p.target : null;
    if (!target || !args.validWriteTargets.has(target)) {
      if (target) discarded.push(`"${target}" is not one of the actions available here`);
      continue;
    }
    if (!isSurfaceWritePolicy(p.policy)) continue;
    writePolicies.push({
      target,
      policy: p.policy,
      reason: typeof p.reason === "string" ? p.reason : "",
    });
  }

  if (suggestions.length === 0 && writePolicies.length === 0) return null;

  return {
    suggestions,
    writePolicies,
    notes: typeof obj.overall_notes === "string" ? obj.overall_notes : "",
    discarded,
  };
}

/** Accepted suggestions → the canonical ValueMappingMap the save path speaks. */
export function suggestionsToMappings(
  suggestions: readonly BindingSuggestion[],
): ValueMappingMap {
  const out: ValueMappingMap = {};
  for (const s of suggestions) out[s.target] = s.mapping;
  return out;
}

/**
 * The raw storage keys a suggestion reads from, in delivery order. Empty for a
 * decision that takes nothing from the inventory. The review row prints these
 * on its own mono line — the human label is what a person READS, the key is
 * what they match against the manual editor and the agent's contract.
 */
export function suggestionSourceKeys(s: BindingSuggestion): string[] {
  return s.mapping.mapType === "surface_value" ||
    s.mapping.mapType === "offered_value"
    ? [String(s.mapping.target), ...s.alsoFrom]
    : [];
}

/**
 * Human summary of one suggestion's decision, for the review row.
 *
 * 🚨 NAMES READ AS THE MANUAL EDITOR PRINTS THEM (V2 finding G5a). The proposal
 * sits two inches from the manual mapping editor, which renders every input and
 * every value through `formatVariableDisplayName` — so a proposal saying
 * `From "system_prompt"` while the editor beside it says "System Prompt" reads
 * as a different, more technical system. Same helper, same words; the raw keys
 * are still shown by the row itself, on their own line.
 */
export function describeSuggestion(s: BindingSuggestion): string {
  switch (s.mapping.mapType) {
    case "surface_value":
      return s.alsoFrom.length > 0
        ? // D18.2 — say the whole combination and the order, because the order
          // IS the delivered text.
          `From ${[s.mapping.target, ...s.alsoFrom].map((n) => `"${formatVariableDisplayName(n)}"`).join(" + ")}, joined in that order`
        : `From "${formatVariableDisplayName(s.mapping.target)}"${s.mapping.required ? " (required)" : ""}`;
    case "direct_value":
      return `Fixed value: ${typeof s.mapping.target === "string" ? `"${s.mapping.target}"` : JSON.stringify(s.mapping.target)}`;
    case "prompt_user":
      return `Ask the user: "${s.mapping.prompt}"`;
    case "unmapped":
      return "Deliberately left empty (agent default applies)";
    case "offered_value":
      // Mandate consumption entries never appear in surface suggestions —
      // present, not silently absent, if data ever routes one here.
      return `Mandate consumption entry for "${formatVariableDisplayName(String(s.mapping.target))}" (not a surface mapping)`;
  }
}
