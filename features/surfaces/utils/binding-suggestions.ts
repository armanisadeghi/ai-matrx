/**
 * binding-suggestions — pure core for the quick-bind "AI map" flow.
 *
 * The `surfaces_client.binding_mapper` mandate agent receives the surface's
 * declared values + write targets and the target agent's input contract
 * (variables AND context slots — the context-mandate doctrine is written into
 * the agent's DB definition), and returns a structured proposal. This module
 * owns both directions of that wire:
 *
 *   buildMapperVariables()  — surface/agent state → the agent's variables
 *   parseMapperResult()     — accumulated run text → validated suggestions
 *   suggestionsToMappings() — accepted suggestions → the canonical
 *                             ValueMappingMap the bind save already speaks
 *
 * Everything here is pure and synchronous so it is trivially testable; the
 * mandate run itself stays in the panel (useMandateRunner).
 */

import { extractFirstJson } from "@/utils/json/extract-json";
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
  contextSlots: AgentDefinition["contextSlots"];
}

/** Build the mapper mandate's variable payload from live client state. */
export function buildMapperVariables(args: {
  surfaceName: string;
  surfaceLabel: string;
  agent: MapperAgentInfo;
  surfaceValues: SurfaceValue[];
  writeTargets: readonly SurfaceWriteTarget[];
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
    ...(args.agent.contextSlots ?? []).map((s) => ({
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
}): MapperProposal | null {
  const extracted = extractFirstJson(args.raw, { allowFuzzy: true });
  const root = extracted?.value;
  if (!root || typeof root !== "object" || Array.isArray(root)) return null;
  const obj = root as Record<string, unknown>;

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
    if (mapType === "surface_value") {
      const sv = typeof m.surface_value === "string" ? m.surface_value : null;
      if (!sv || !args.validSurfaceValues.has(sv)) {
        discarded.push(
          `"${target}" pointed at unknown page value "${m.surface_value ?? ""}"`,
        );
        continue;
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
      if (target) discarded.push(`"${target}" is not one of this page's actions`);
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

/** Human summary of one suggestion's decision, for the review row. */
export function describeSuggestion(s: BindingSuggestion): string {
  switch (s.mapping.mapType) {
    case "surface_value":
      return `From page value "${s.mapping.target}"${s.mapping.required ? " (required)" : ""}`;
    case "direct_value":
      return `Fixed value: ${typeof s.mapping.target === "string" ? `"${s.mapping.target}"` : JSON.stringify(s.mapping.target)}`;
    case "prompt_user":
      return `Ask the user: "${s.mapping.prompt}"`;
    case "unmapped":
      return "Deliberately left empty (agent default applies)";
  }
}
