/**
 * Value-mapping layer merge — the per-key precedence engine for launch-time
 * mapping resolution.
 *
 * Layers arrive ordered weakest → strongest (binding:global →
 * binding:org:<id> → binding:user → shortcut). Later layers override earlier
 * ones PER KEY — a user binding that maps only `tone` does not erase the org
 * binding's `transcript` mapping.
 *
 * `inertLayers` lists layers that declared at least one mapping but won zero
 * keys — a strong signal of a configuration mistake (e.g. an org binding
 * fully shadowed by a user binding). Callers must surface these loudly; a
 * silently ignored binding is exactly how the dead org-binding bug of
 * 2026-06 stayed invisible.
 */

import type { ValueMappingMap } from "@/features/surfaces/types";

export interface MappingLayer {
  /** Stable display name, e.g. "binding:global", "binding:org:5dc930e9", "shortcut". */
  name: string;
  mappings: ValueMappingMap | null | undefined;
}

export interface MergedValueMappings {
  merged: ValueMappingMap;
  /** key → name of the layer that supplied the winning mapping. */
  provenance: Record<string, string>;
  /** Non-empty layers that contributed zero winning keys. */
  inertLayers: string[];
}

export function mergeValueMappingLayers(
  layers: MappingLayer[],
): MergedValueMappings {
  const merged: ValueMappingMap = {};
  const provenance: Record<string, string> = {};
  for (const layer of layers) {
    if (!layer.mappings) continue;
    for (const [key, mapping] of Object.entries(layer.mappings)) {
      merged[key] = mapping;
      provenance[key] = layer.name;
    }
  }
  const winners = new Set(Object.values(provenance));
  const inertLayers = layers
    .filter(
      (l) =>
        l.mappings &&
        Object.keys(l.mappings).length > 0 &&
        !winners.has(l.name),
    )
    .map((l) => l.name);
  return { merged, provenance, inertLayers };
}
