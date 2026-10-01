/**
 * Scope Mapping Utility
 *
 * Maps UI-provided scope data (selected text, document content, context objects)
 * to agent variables and context entries using a shortcut's scopeMappings +
 * contextMappings.
 *
 * Resolution order per UI-scope key (first match wins):
 *   1. scopeMappings   — explicit UI key → agent variable/context target
 *   2. contextMappings — explicit UI key → agent context-policy key
 *   3. Ad-hoc         — key falls through as a context entry; if the key
 *                       matches an agent context policy, slotMatched=true.
 *                       Only when the launch declared NO mapping: an
 *                       engineered launch admits just the agent's own slots
 *                       and the surface's always-on values (W-31).
 */

import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import type {
  ContextPolicy,
  ContextObjectType,
} from "@/features/agents/types/agent-api-types";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import type { ApplicationScope } from "@/features/agents/types/scope.types";
import type { ValueMappingMap } from "@/features/surfaces/types";
import {
  resolveValueMappings,
  type PendingPrompt,
} from "@/features/surfaces/utils/value-mapping-resolver";
import { assertNativeContextValue } from "@/features/surfaces/utils/context-value-contract";
import { isUuidShape } from "@ai-matrx/kit/uuid";

export type { ApplicationScope } from "@/features/agents/types/scope.types";
export type { PendingPrompt } from "@/features/surfaces/utils/value-mapping-resolver";

export interface ScopeMappingResult {
  variableValues: Record<string, unknown>;
  contextEntries: InstanceContextEntry[];
}

export interface SurfaceBoundScopeMappingResult extends ScopeMappingResult {
  /** Targets that need user-input via a pre-launch dialog. */
  pendingPrompts: PendingPrompt[];
  /** Non-fatal warnings emitted by the SurfaceValue resolver. */
  warnings: string[];
  /** Fatal errors — if non-empty the caller should abort the launch. */
  errors: string[];
}

function inferContextType(value: unknown): ContextObjectType {
  if (typeof value === "string") {
    try {
      new URL(value);
      return "file_url";
    } catch {
      return "text";
    }
  }
  return "json";
}

function createContextEntry(
  key: string,
  value: unknown,
  policy: { key: string; type?: ContextObjectType; label?: string } | undefined,
): InstanceContextEntry {
  assertNativeContextValue(key, value);
  return {
    key,
    value,
    slotMatched: !!policy,
    type: policy?.type ?? inferContextType(value),
    label: policy?.label ?? key,
  };
}

export function mapScopeToInstance(
  applicationScope: ApplicationScope,
  scopeMappings: Record<string, string> | null,
  variableDefinitions: VariableDefinition[] | null | undefined,
  contextPolicies:
    | Array<{
        key: string;
        type?: ContextObjectType;
        label?: string;
      }>
    | null
    | undefined,
  contextMappings: Record<string, string> | null = null,
  options: ScopeMappingOptions = {},
): ScopeMappingResult {
  const defs = variableDefinitions ?? [];
  const slots = contextPolicies ?? [];
  const variableNames = new Set(defs.map((v) => v.name));
  const policyMap = new Map(slots.map((s) => [s.key, s]));

  const variableValues: Record<string, unknown> = {};
  const contextEntries: InstanceContextEntry[] = [];
  const mappedScopeKeys = new Set<string>();

  // ── Pass 1: scopeMappings (UI key → variable OR context key) ────────────
  if (scopeMappings) {
    for (const [sourceKey, targetName] of Object.entries(scopeMappings)) {
      if (!targetName?.trim()) {
        // A mapping with no target names nothing — it must never send its
        // source under an empty key (live: a shortcut mapping `content` → "").
        console.warn(`[scope-mapping] "${sourceKey}" is mapped to an empty target — skipped`);
        continue;
      }
      const value = applicationScope[sourceKey];
      if (value === undefined) {
        continue;
      }

      mappedScopeKeys.add(sourceKey);

      if (variableNames.has(targetName)) {
        variableValues[targetName] = value;
      } else {
        const policy = policyMap.get(targetName);
        contextEntries.push(createContextEntry(targetName, value, policy));
      }
    }
  }

  // ── Pass 2: contextMappings (UI key → agent context-policy key) ───────────
  if (contextMappings) {
    for (const [sourceKey, policyKey] of Object.entries(contextMappings)) {
      if (mappedScopeKeys.has(sourceKey)) {
        continue;
      }
      if (!policyKey?.trim()) {
        console.warn(`[scope-mapping] "${sourceKey}" is mapped to an empty context key — skipped`);
        continue;
      }
      const value = applicationScope[sourceKey];
      if (value === undefined) {
        continue;
      }

      mappedScopeKeys.add(sourceKey);

      const policy = policyMap.get(policyKey);
      contextEntries.push(createContextEntry(policyKey, value, policy));
    }
  }

  // ── Pass 3: Unmapped scope keys fall through as ad-hoc context ──────────
  // An ENGINEERED launch (`mapScopeToInstanceWithSurface`) admits only the agent's own
  // named slots and the surface's always-on values here — never the page.
  const admits = (key: string) =>
    !options.engineered ||
    policyMap.has(key) ||
    alwaysOnKeySet(options.alwaysOnKeys).has(key);
  for (const [key, value] of Object.entries(applicationScope)) {
    if (mappedScopeKeys.has(key) || value === undefined) continue;
    // Well-known `context` object gets flattened into entries
    if (key === "context" && typeof value === "object" && value !== null) {
      for (const [ctxKey, ctxVal] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (ctxVal === undefined || !admits(ctxKey)) continue;
        const policy = policyMap.get(ctxKey);
        contextEntries.push(createContextEntry(ctxKey, ctxVal, policy));
      }
      continue;
    }

    if (!admits(key)) continue;
    const policy = policyMap.get(key);
    contextEntries.push(createContextEntry(key, value, policy));
  }

  return { variableValues, contextEntries };
}

export interface ScopeMappingOptions {
  /**
   * The launch declared its inputs (a shortcut or binding mapping), so the
   * page's unmapped values stay home. Set by `mapScopeToInstanceWithSurface`.
   */
  engineered?: boolean;
  /**
   * Values the surface sends on every run whatever the mapping says —
   * `alwaysOnSurfaceKeys(surfaceName, scope)` in
   * `features/surfaces/utils/always-on-context.ts`.
   */
  alwaysOnKeys?: Iterable<string> | null;
}

function alwaysOnKeySet(keys: Iterable<string> | null | undefined): Set<string> {
  return keys instanceof Set ? (keys as Set<string>) : new Set(keys ?? []);
}

function hasEntries(map: object | null | undefined): boolean {
  return !!map && Object.keys(map).length > 0;
}

/**
 * Combine the **legacy** scope mapping pass (shortcut bundle's
 * `scopeMappings`) with the new **SurfaceValue** mapping pass
 * (agent↔surface binding value_mappings (platform.associations edge metadata)) into a single result.
 *
 * Order of resolution:
 *   1. Legacy `mapScopeToInstance` runs first — it produces the baseline
 *      `variableValues` / `contextEntries` from the shortcut's mapping
 *      bundle and from raw `applicationScope` keys that match agent names.
 *   2. Surface `value_mappings` runs next via `resolveValueMappings`. Its
 *      output overlays the legacy result (surface bindings win on conflict
 *      because they're the more specific, user-defined layer).
 *
 * Auto-name-match is disabled on the second pass — the legacy pass already
 * did it. The new pass only applies explicit ValueMapping entries.
 */
export function mapScopeToInstanceWithSurface(
  applicationScope: ApplicationScope,
  scopeMappings: Record<string, string> | null,
  surfaceValueMappings: ValueMappingMap | null,
  variableDefinitions: VariableDefinition[] | null | undefined,
  contextPolicies:
    | Array<{
        key: string;
        type?: ContextObjectType;
        label?: string;
      }>
    | null
    | undefined,
  contextMappings: Record<string, string> | null = null,
  options: ScopeMappingOptions = {},
): SurfaceBoundScopeMappingResult {
  // THE ENGINEERED-INPUTS BOUNDARY (W-31). A launch that declares ANY mapping
  // — a shortcut's scope/context/value mappings or a binding's value_mappings
  // — receives exactly what it mapped, plus the agent's own named context
  // slots and the surface's always-on values. Nothing else from the page.
  // A launch with no mapping at all (a chat that follows the page) keeps the
  // page's values as before. Every launch and every follow-up turn reaches
  // the model through here: launchAgentExecution, createInstanceFromShortcut,
  // refreshSurfaceScope.
  // `options.engineered` carries a mapping this call cannot see — the
  // conversation's per-launch `runtime.valueMappings`, or a shortcut whose
  // record is no longer loaded (`ExecutionInstance.engineeredInputs`).
  const engineered =
    options.engineered === true ||
    hasEntries(scopeMappings) ||
    hasEntries(contextMappings) ||
    hasEntries(surfaceValueMappings);

  // Pass 1 — legacy.
  const legacy = mapScopeToInstance(
    applicationScope,
    scopeMappings,
    variableDefinitions,
    contextPolicies,
    contextMappings,
    { engineered, alwaysOnKeys: options.alwaysOnKeys },
  );

  // Pass 2 — surface value_mappings (no auto-name-match; legacy already covered it).
  const surface = resolveValueMappings(
    applicationScope,
    surfaceValueMappings ?? {},
    variableDefinitions,
    contextPolicies,
    { autoNameMatch: false },
  );

  // Surface bindings win on conflict.
  const variableValues = {
    ...legacy.variableValues,
    ...surface.variableValues,
  };

  // Context entries: replace any legacy entries whose key matches a surface entry.
  const surfaceKeys = new Set(surface.contextEntries.map((e) => e.key));
  let contextEntries: InstanceContextEntry[] = [
    ...legacy.contextEntries.filter((e) => !surfaceKeys.has(e.key)),
    ...surface.contextEntries,
  ];

  // A canonical file_id replaces overlapping full-document payload aliases.
  // Keep explicitly mapped values and declared Mandates, plus the active
  // slice for non-full scopes; remove only redundant ad-hoc fallthrough.
  const hasFileReference =
    typeof applicationScope.file_id === "string" &&
    isUuidShape(
      applicationScope.file_id.trim(),
    );
  if (hasFileReference) {
    const explicitlyMappedSources = new Set([
      ...Object.keys(scopeMappings ?? {}),
      ...Object.keys(contextMappings ?? {}),
      ...Object.keys(surfaceValueMappings ?? {}),
    ]);
    const declaredSlots = new Set(
      (contextPolicies ?? []).map((policy) => policy.key),
    );
    const redundantKeys = new Set([
      "full_document_text",
      "content",
      "selection",
      "processed_document_id",
      ...(applicationScope.scope_kind === "full" ? ["active_scope_text"] : []),
    ]);
    contextEntries = contextEntries.filter(
      (entry) =>
        entry.value !== "" &&
        !(
          redundantKeys.has(entry.key) &&
          !explicitlyMappedSources.has(entry.key) &&
          !declaredSlots.has(entry.key)
        ),
    );

    const mediaVariables = new Set(
      (variableDefinitions ?? [])
        .filter((definition) =>
          ["document", "image", "audio", "video"].includes(
            definition.customComponent?.type ?? "",
          ),
        )
        .map((definition) => definition.name),
    );
    const fileMappedToMedia =
      Object.entries(scopeMappings ?? {}).some(
        ([source, target]) =>
          source === "file_id" && mediaVariables.has(target),
      ) ||
      Object.entries(surfaceValueMappings ?? {}).some(
        ([target, mapping]) =>
          mediaVariables.has(target) &&
          mapping.mapType === "surface_value" &&
          mapping.target === "file_id",
      );
    if (fileMappedToMedia) {
      contextEntries = contextEntries.filter(
        (entry) => entry.key !== "file_id",
      );
    }
  }

  return {
    variableValues,
    contextEntries,
    pendingPrompts: surface.pendingPrompts,
    warnings: surface.warnings,
    errors: surface.errors,
  };
}
