/**
 * Single source of truth for reading a shortcut's value mappings.
 *
 * The schema (see [docs/agx_shortcut_surface_changes.md](../../../docs/agx_shortcut_surface_changes.md))
 * keeps the legacy `scope_mappings` / `context_mappings` columns alongside the
 * new `value_mappings` column during the dual-system window. Every consumer
 * that needs the "what does this shortcut bind?" view should call
 * `resolveShortcutMappings` instead of reaching for the columns directly —
 * that way deleting the legacy columns later is a one-place change.
 *
 * DSL direction (canonical, per `features/surfaces/types.ts`):
 *   keys   = agent variable / context-slot names (the TARGET on the agent)
 *   target = the surface value name the data comes from
 *
 * The legacy columns run in the INVERSE direction (surface key → target
 * name), so the adapters below swap key and value when promoting.
 *
 * Composition: legacy `scope_mappings` + `context_mappings` are promoted as
 * the base; the new `value_mappings` DSL overrides per key. A shortcut that
 * carries both (created legacy, edited in the new UI) keeps its legacy slot
 * mappings unless the new column addresses the same target.
 */

import type { AgentShortcut } from "@/features/agents/redux/agent-shortcuts/types";
import type {
  ValueMapping,
  ValueMappingMap,
} from "@/features/surfaces/types";

/**
 * Promote a legacy inverse-direction map (surface key → agent target name)
 * into the canonical DSL (agent target name → surface_value mapping).
 * Used for both `scope_mappings` (targets = variables) and
 * `context_mappings` (targets = context slots) — the resolver classifies
 * targets itself, so both promote identically.
 */
export function adaptLegacyScopeMappings(
  legacyMappings: Record<string, string> | null | undefined,
): ValueMappingMap {
  if (!legacyMappings) return {};
  const out: ValueMappingMap = {};
  for (const [surfaceValueName, targetName] of Object.entries(
    legacyMappings,
  )) {
    if (typeof targetName !== "string" || targetName === "") {
      continue;
    }
    const entry: ValueMapping = {
      mapType: "surface_value",
      target: surfaceValueName,
    };
    out[targetName] = entry;
  }
  return out;
}

/**
 * Get the canonical `ValueMappingMap` for a shortcut: legacy columns promoted
 * as the base, the new `value_mappings` column overriding per key. Returns
 * `{}` when all are empty so callers can iterate without a null check.
 */
export function resolveShortcutMappings(
  shortcut: Pick<
    AgentShortcut,
    "valueMappings" | "scopeMappings" | "contextMappings"
  >,
): ValueMappingMap {
  return {
    ...adaptLegacyScopeMappings(shortcut.scopeMappings),
    ...adaptLegacyScopeMappings(shortcut.contextMappings),
    ...(shortcut.valueMappings ?? {}),
  };
}
