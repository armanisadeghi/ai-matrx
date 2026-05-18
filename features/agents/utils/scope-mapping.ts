/**
 * Scope Mapping Utility
 *
 * Maps UI-provided scope data (selected text, document content, context objects)
 * to agent variables and context entries using a shortcut's scopeMappings +
 * contextMappings.
 *
 * Resolution order per UI-scope key (first match wins):
 *   1. scopeMappings   — explicit UI key → agent variable/context target
 *   2. contextMappings — explicit UI key → agent context-slot key
 *   3. Ad-hoc         — key falls through as a context entry; if the key
 *                       matches an agent context slot, slotMatched=true.
 */

import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import type {
  ContextSlot,
  ContextObjectType,
} from "@/features/agents/types/agent-api-types";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import { ApplicationScope } from "@/features/agents/types/scope.types";
import type { ValueMappingMap } from "@/features/surfaces/types";
import {
  resolveValueMappings,
  type PendingPrompt,
} from "@/features/surfaces/utils/value-mapping-resolver";

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

export function mapScopeToInstance(
  applicationScope: ApplicationScope,
  scopeMappings: Record<string, string> | null,
  variableDefinitions: VariableDefinition[] | null | undefined,
  contextSlots:
    | Array<{
        key: string;
        type?: ContextObjectType;
        label?: string;
      }>
    | null
    | undefined,
  contextMappings: Record<string, string> | null = null,
): ScopeMappingResult {
  const defs = variableDefinitions ?? [];
  const slots = contextSlots ?? [];
  const variableNames = new Set(defs.map((v) => v.name));
  const slotMap = new Map(slots.map((s) => [s.key, s]));

  const variableValues: Record<string, unknown> = {};
  const contextEntries: InstanceContextEntry[] = [];
  const mappedScopeKeys = new Set<string>();

  const trace = typeof window !== "undefined";
  const log = (msg: string, ...args: unknown[]) => {
    if (trace)
      console.log(
        `%c[Shortcut]%c ${msg}`,
        "color:#10b981;font-weight:bold",
        "color:inherit",
        ...args,
      );
  };

  if (trace) {
    console.groupCollapsed(
      "%c[Shortcut] mapScopeToInstance",
      "color:#10b981;font-weight:bold",
    );
    log("ui scope keys:", Object.keys(applicationScope));
    log("scopeMappings (UI → variable or slot):", scopeMappings ?? "(none)");
    log("contextMappings (UI → context slot):", contextMappings ?? "(none)");
    log("agent knows variables:", [...variableNames]);
    log("agent knows slots:", [...slotMap.keys()]);
  }

  // ── Pass 1: scopeMappings (UI key → variable OR context key) ────────────
  if (scopeMappings) {
    for (const [sourceKey, targetName] of Object.entries(scopeMappings)) {
      const value = applicationScope[sourceKey];
      if (value === undefined) {
        log(
          `  ✗ "${sourceKey}" → "${targetName}": UI scope has no value — skipped`,
        );
        continue;
      }

      mappedScopeKeys.add(sourceKey);

      if (variableNames.has(targetName)) {
        variableValues[targetName] = value;
        log(
          `  ✓ "${sourceKey}" → variable "${targetName}" =`,
          previewValue(value),
        );
      } else {
        const slot = slotMap.get(targetName);
        contextEntries.push({
          key: targetName,
          value,
          slotMatched: !!slot,
          type: slot?.type ?? inferContextType(value),
          label: slot?.label ?? targetName,
        });
        log(
          `  ✓ "${sourceKey}" → context ${slot ? `slot "${targetName}"` : `ad-hoc "${targetName}"`} =`,
          previewValue(value),
        );
      }
    }
  }

  // ── Pass 2: contextMappings (UI key → agent context-slot key) ───────────
  if (contextMappings) {
    for (const [sourceKey, slotKey] of Object.entries(contextMappings)) {
      if (mappedScopeKeys.has(sourceKey)) {
        log(
          `  • contextMappings "${sourceKey}" skipped — already mapped by scopeMappings`,
        );
        continue;
      }
      const value = applicationScope[sourceKey];
      if (value === undefined) {
        log(
          `  ✗ contextMappings "${sourceKey}" → slot "${slotKey}": UI scope has no value — skipped`,
        );
        continue;
      }

      mappedScopeKeys.add(sourceKey);

      const slot = slotMap.get(slotKey);
      contextEntries.push({
        key: slotKey,
        value,
        slotMatched: !!slot,
        type: slot?.type ?? inferContextType(value),
        label: slot?.label ?? slotKey,
      });
      log(
        `  ✓ "${sourceKey}" → context ${slot ? `slot "${slotKey}"` : `ad-hoc "${slotKey}"`} =`,
        previewValue(value),
      );
    }
  }

  // ── Pass 3: Unmapped scope keys fall through as ad-hoc context ──────────
  for (const [key, value] of Object.entries(applicationScope)) {
    if (mappedScopeKeys.has(key) || value === undefined) continue;
    // Well-known `context` object gets flattened into entries
    if (key === "context" && typeof value === "object" && value !== null) {
      for (const [ctxKey, ctxVal] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (ctxVal === undefined) continue;
        const slot = slotMap.get(ctxKey);
        contextEntries.push({
          key: ctxKey,
          value: ctxVal,
          slotMatched: !!slot,
          type: slot?.type ?? inferContextType(ctxVal),
          label: slot?.label ?? ctxKey,
        });
        log(`  ◦ ad-hoc from context."${ctxKey}" →`, previewValue(ctxVal));
      }
      continue;
    }

    const slot = slotMap.get(key);
    contextEntries.push({
      key,
      value,
      slotMatched: !!slot,
      type: slot?.type ?? inferContextType(value),
      label: slot?.label ?? key,
    });
    log(`  ◦ ad-hoc "${key}" →`, previewValue(value));
  }

  if (trace) {
    log(
      "result:",
      `${Object.keys(variableValues).length} variables, ${contextEntries.length} context entries`,
    );
    console.groupEnd();
  }

  return { variableValues, contextEntries };
}

function previewValue(v: unknown): string {
  if (typeof v === "string") {
    return `"${v.slice(0, 60)}"${v.length > 60 ? "…" : ""} (${v.length} chars)`;
  }
  if (v && typeof v === "object") {
    return `<${Array.isArray(v) ? "array" : "object"} ${Object.keys(v as object).length} keys>`;
  }
  return String(v);
}

/**
 * Combine the **legacy** scope mapping pass (shortcut bundle's
 * `scopeMappings`) with the new **SurfaceValue** mapping pass
 * (`agx_agent_surface.value_mappings`) into a single result.
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
  contextSlots:
    | Array<{
        key: string;
        type?: ContextObjectType;
        label?: string;
      }>
    | null
    | undefined,
  contextMappings: Record<string, string> | null = null,
): SurfaceBoundScopeMappingResult {
  // Pass 1 — legacy.
  const legacy = mapScopeToInstance(
    applicationScope,
    scopeMappings,
    variableDefinitions,
    contextSlots,
    contextMappings,
  );

  // Pass 2 — surface value_mappings (no auto-name-match; legacy already covered it).
  const surface = resolveValueMappings(
    applicationScope,
    surfaceValueMappings ?? {},
    variableDefinitions,
    contextSlots,
    { autoNameMatch: false },
  );

  // Surface bindings win on conflict.
  const variableValues = {
    ...legacy.variableValues,
    ...surface.variableValues,
  };

  // Context entries: replace any legacy entries whose key matches a surface entry.
  const surfaceKeys = new Set(surface.contextEntries.map((e) => e.key));
  const contextEntries: InstanceContextEntry[] = [
    ...legacy.contextEntries.filter((e) => !surfaceKeys.has(e.key)),
    ...surface.contextEntries,
  ];

  return {
    variableValues,
    contextEntries,
    pendingPrompts: surface.pendingPrompts,
    warnings: surface.warnings,
    errors: surface.errors,
  };
}
