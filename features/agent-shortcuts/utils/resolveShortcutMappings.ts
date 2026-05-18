/**
 * Single source of truth for reading a shortcut's value mappings.
 *
 * The schema (see [docs/agx_shortcut_surface_changes.md](../../../docs/agx_shortcut_surface_changes.md))
 * keeps the legacy `scope_mappings` column alongside the new `value_mappings`
 * column during the dual-system window. Every consumer that needs the
 * "what does this shortcut bind?" view should call `resolveShortcutMappings`
 * instead of reaching for either column directly — that way deleting
 * `scope_mappings` later is a one-place change.
 *
 * Precedence:
 *  1. `value_mappings` (the rich DSL) when present.
 *  2. Otherwise, the adapter promotes the legacy `scope_mappings`
 *     (key → variable name) into equivalent `surface_value` entries so
 *     downstream resolvers can treat both shapes uniformly.
 */

import type { AgentShortcut } from "@/features/agents/redux/agent-shortcuts/types";
import type {
  ValueMapping,
  ValueMappingMap,
} from "@/features/surfaces/types";

/**
 * Convert a legacy `scope_mappings` map (key → variable/slot name) into the
 * new `value_mappings` DSL by wrapping every entry as a `surface_value`
 * mapping. The legacy column's keys ARE the surface-value names, and its
 * values ARE the target variable names — exactly the surface_value shape.
 */
export function adaptLegacyScopeMappings(
  scopeMappings: Record<string, string> | null | undefined,
): ValueMappingMap {
  if (!scopeMappings) return {};
  const out: ValueMappingMap = {};
  for (const [surfaceValueName, targetVariableName] of Object.entries(
    scopeMappings,
  )) {
    if (typeof targetVariableName !== "string" || targetVariableName === "") {
      continue;
    }
    const entry: ValueMapping = {
      mapType: "surface_value",
      target: targetVariableName,
    };
    out[surfaceValueName] = entry;
  }
  return out;
}

/**
 * Get the canonical `ValueMappingMap` for a shortcut, preferring the new
 * column and falling back to the legacy one. Returns `{}` when both are
 * empty so callers can iterate without a null check.
 */
export function resolveShortcutMappings(
  shortcut: Pick<AgentShortcut, "valueMappings" | "scopeMappings">,
): ValueMappingMap {
  if (shortcut.valueMappings && Object.keys(shortcut.valueMappings).length > 0) {
    return shortcut.valueMappings;
  }
  return adaptLegacyScopeMappings(shortcut.scopeMappings);
}
