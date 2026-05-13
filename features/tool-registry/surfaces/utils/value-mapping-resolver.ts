/**
 * Value Mapping Resolver — the runtime layer that turns a
 * `(ValueMappingMap, ApplicationScope)` pair into concrete agent variable
 * values + context entries + pending user-prompts.
 *
 * Direction note: this resolver runs in the **forward** direction —
 *   keys = agent variable / context-slot / tool-arg names
 *   values = `ValueMapping` describing where each target gets its data.
 *
 * The legacy resolver in `features/agents/utils/scope-mapping.ts` runs in the
 * **inverse** direction — keys = surface scope names, values = target names —
 * and is preserved for backward compatibility with `agx_shortcut.scope_mappings`.
 *
 * The two are stackable: an agent launched from a surface goes through
 *   1. legacy `mapScopeToInstance` (for the shortcut bundle), then
 *   2. `resolveValueMappings` (for the `agx_agent_surface.value_mappings` blob).
 *
 * Phase 1 keeps both layers independent. A future pass can collapse them
 * once every shortcut migrates to the new shape.
 */

import type {
  ApplicationScope,
} from "@/features/agents/types/scope.types";
import type {
  ContextObjectType,
  ContextSlot,
} from "@/features/agents/types/agent-api-types";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import type {
  ValueMapping,
  ValueMappingMap,
} from "@/features/tool-registry/surfaces/types";
import { isValueMappingMap } from "@/features/tool-registry/surfaces/types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PendingPrompt {
  /** Target name on the agent (variable or context-slot key). */
  targetName: string;
  /** Whether this resolves into a `variable` or a `contextEntry`. */
  targetKind: "variable" | "context_slot";
  /** Prompt text shown to the user. */
  prompt: string;
  /** Optional pre-filled value (string forms render in the input field). */
  defaultValue?: unknown;
  /** When true, the dialog cannot be cancelled. */
  required?: boolean;
}

export interface ValueMappingResolveResult {
  /** Resolved agent variable values, keyed by variable name. */
  variableValues: Record<string, unknown>;
  /** Resolved context entries (slot-matched when key matches an agent slot). */
  contextEntries: InstanceContextEntry[];
  /** Targets that need user input via a pre-launch dialog. Must be drained by the caller. */
  pendingPrompts: PendingPrompt[];
  /** Set of `key`s consumed from the JSONB (used for auto-name-match dedup). */
  consumedMappingKeys: Set<string>;
  /** Non-fatal warnings (e.g. `prompt_user` on a tool-arg mapping). */
  warnings: string[];
  /** Fatal errors that should abort the launch (e.g. `required: true` and the surface_value is missing at runtime). */
  errors: string[];
}

export interface ResolveOptions {
  /**
   * When true, the resolver is operating on a tool's `arg_mappings`. In that
   * mode, `prompt_user` is a hard error (tools fire mid-stream and we can't
   * open a dialog).
   */
  forToolArgs?: boolean;
  /**
   * When true, the auto-name-match pass also runs at the end (keys that
   * appear in `applicationScope` but had no explicit mapping AND match an
   * agent variable or context slot are auto-bound). Defaults to true.
   */
  autoNameMatch?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inferContextType(value: unknown): ContextObjectType {
  if (typeof value === "string") {
    try {
      // URL-shaped strings get hinted as `file_url` to mirror the legacy resolver.
      new URL(value);
      return "file_url";
    } catch {
      return "text";
    }
  }
  return "json";
}

function classifyTarget(
  name: string,
  variableNames: Set<string>,
  slotMap: Map<string, ContextSlot | { key: string; type?: ContextObjectType; label?: string }>,
): "variable" | "context_slot" | "unknown" {
  if (variableNames.has(name)) return "variable";
  if (slotMap.has(name)) return "context_slot";
  return "unknown";
}

function pushContextEntry(
  out: InstanceContextEntry[],
  targetName: string,
  value: unknown,
  slotMap: Map<string, ContextSlot | { key: string; type?: ContextObjectType; label?: string }>,
): void {
  const slot = slotMap.get(targetName);
  out.push({
    key: targetName,
    value,
    slotMatched: !!slot,
    type: slot?.type ?? inferContextType(value),
    label: slot?.label ?? targetName,
  });
}

// ---------------------------------------------------------------------------
// resolveValueMappings — the canonical resolver
// ---------------------------------------------------------------------------

export function resolveValueMappings(
  applicationScope: ApplicationScope,
  valueMappings: ValueMappingMap | null | undefined,
  variableDefinitions: VariableDefinition[] | null | undefined,
  contextSlots:
    | Array<{ key: string; type?: ContextObjectType; label?: string }>
    | null
    | undefined,
  opts: ResolveOptions = {},
): ValueMappingResolveResult {
  const { forToolArgs = false, autoNameMatch = true } = opts;

  const defs = variableDefinitions ?? [];
  const slots = contextSlots ?? [];
  const variableNames = new Set(defs.map((v) => v.name));
  const slotMap = new Map<string, { key: string; type?: ContextObjectType; label?: string }>(
    slots.map((s) => [s.key, s]),
  );

  const variableValues: Record<string, unknown> = {};
  const contextEntries: InstanceContextEntry[] = [];
  const pendingPrompts: PendingPrompt[] = [];
  const consumedMappingKeys = new Set<string>();
  const warnings: string[] = [];
  const errors: string[] = [];

  const mappings: ValueMappingMap = isValueMappingMap(valueMappings) ? valueMappings : {};

  // --- Pass 1: explicit mappings ------------------------------------------
  for (const [targetName, mapping] of Object.entries(mappings)) {
    consumedMappingKeys.add(targetName);
    resolveOne(
      targetName,
      mapping,
      applicationScope,
      variableNames,
      slotMap,
      variableValues,
      contextEntries,
      pendingPrompts,
      warnings,
      errors,
      forToolArgs,
    );
  }

  // --- Pass 2: auto-name-match -------------------------------------------
  // Targets without an explicit mapping that share a name with a key in
  // applicationScope are auto-bound. Mirrors the legacy "everyone-agrees-
  // on-`selection`" behavior, but the direction is now correct (target
  // name = scope key).
  if (autoNameMatch) {
    for (const varName of variableNames) {
      if (consumedMappingKeys.has(varName)) continue;
      if (varName in variableValues) continue;
      if (varName in applicationScope) {
        const v = applicationScope[varName];
        if (v !== undefined) {
          variableValues[varName] = v;
        }
      }
    }
    for (const [slotKey] of slotMap) {
      if (consumedMappingKeys.has(slotKey)) continue;
      if (slotKey in applicationScope) {
        const v = applicationScope[slotKey];
        if (v !== undefined) {
          pushContextEntry(contextEntries, slotKey, v, slotMap);
        }
      }
    }
  }

  return {
    variableValues,
    contextEntries,
    pendingPrompts,
    consumedMappingKeys,
    warnings,
    errors,
  };
}

function resolveOne(
  targetName: string,
  mapping: ValueMapping,
  applicationScope: ApplicationScope,
  variableNames: Set<string>,
  slotMap: Map<string, { key: string; type?: ContextObjectType; label?: string }>,
  variableValues: Record<string, unknown>,
  contextEntries: InstanceContextEntry[],
  pendingPrompts: PendingPrompt[],
  warnings: string[],
  errors: string[],
  forToolArgs: boolean,
): void {
  const targetKind = classifyTarget(targetName, variableNames, slotMap);

  switch (mapping.mapType) {
    case "surface_value": {
      const v = applicationScope[mapping.target];
      if (v === undefined) {
        if (mapping.required) {
          errors.push(
            `Required surface value "${mapping.target}" missing for target "${targetName}".`,
          );
        }
        return;
      }
      writeResolvedValue(
        targetName,
        targetKind,
        v,
        variableValues,
        contextEntries,
        slotMap,
      );
      return;
    }

    case "direct_value": {
      writeResolvedValue(
        targetName,
        targetKind,
        mapping.target,
        variableValues,
        contextEntries,
        slotMap,
      );
      return;
    }

    case "prompt_user": {
      if (forToolArgs) {
        warnings.push(
          `"prompt_user" mapping rejected for tool arg "${targetName}" — tools cannot interrupt for user input. Use direct_value or surface_value instead.`,
        );
        return;
      }
      pendingPrompts.push({
        targetName,
        targetKind: targetKind === "context_slot" ? "context_slot" : "variable",
        prompt: mapping.prompt,
        defaultValue: mapping.defaultValue,
        required: mapping.required,
      });
      return;
    }

    case "unmapped": {
      // Explicit suppression of auto-name-match for this target. Nothing to do.
      return;
    }

    default: {
      // Exhaustive check — TS will flag if a new map type is added without a case.
      const _exhaustive: never = mapping;
      void _exhaustive;
      warnings.push(`Unknown mapping shape for "${targetName}".`);
    }
  }
}

function writeResolvedValue(
  targetName: string,
  targetKind: "variable" | "context_slot" | "unknown",
  value: unknown,
  variableValues: Record<string, unknown>,
  contextEntries: InstanceContextEntry[],
  slotMap: Map<string, { key: string; type?: ContextObjectType; label?: string }>,
): void {
  if (targetKind === "variable") {
    variableValues[targetName] = value;
    return;
  }
  // Unknown targets fall through as context entries — matches the legacy
  // "ad-hoc context" behavior.
  pushContextEntry(contextEntries, targetName, value, slotMap);
}

// ---------------------------------------------------------------------------
// applyResolvedPrompts — merge user-supplied prompt answers into the result
// ---------------------------------------------------------------------------

/**
 * Once the caller has obtained answers to each `PendingPrompt` (via
 * `<TextInputDialog />` or similar), feed them back through this helper to
 * land the values onto the result struct.
 */
export function applyResolvedPrompts(
  result: ValueMappingResolveResult,
  answers: Record<string, unknown>,
  contextSlots:
    | Array<{ key: string; type?: ContextObjectType; label?: string }>
    | null
    | undefined,
): ValueMappingResolveResult {
  const slotMap = new Map<string, { key: string; type?: ContextObjectType; label?: string }>(
    (contextSlots ?? []).map((s) => [s.key, s]),
  );
  for (const prompt of result.pendingPrompts) {
    const v = answers[prompt.targetName];
    if (v === undefined) continue;
    if (prompt.targetKind === "variable") {
      result.variableValues[prompt.targetName] = v;
    } else {
      pushContextEntry(result.contextEntries, prompt.targetName, v, slotMap);
    }
  }
  // Drained.
  result.pendingPrompts = [];
  return result;
}
