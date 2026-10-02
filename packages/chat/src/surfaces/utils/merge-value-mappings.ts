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
 *
 * `autoRun` (payload v3) is the one field that does NOT merge per key — see
 * `MappingLayer.autoRun`.
 */

import type {
  ValueMappingMap,
  WritePolicyMap,
} from "@/features/surfaces/types";

export interface MappingLayer {
  /** Stable display name, e.g. "binding:global", "binding:org:5dc930e9", "shortcut". */
  name: string;
  mappings: ValueMappingMap | null | undefined;
  /**
   * The layer's per-write-target applyPolicy overrides (surface_binding
   * payload v2). Merged per TARGET with the same later-layer-wins precedence
   * as mappings — a user binding that overrides only `page_meta_tags` does not
   * erase the org binding's override for another target.
   */
  writePolicies?: WritePolicyMap | null;
  /**
   * THE AUTO-RUN INVERSION (surface_binding payload v3). Unlike mappings and
   * write policies this is NOT merged per key — it is one answer to one
   * question, so the strongest layer that declares it wins outright: a user
   * binding that turns auto-run off overrides an org binding that turned it
   * on. `undefined`/`null` = the layer says nothing (shortcut layers never
   * declare it — a shortcut carries its own `auto_run` through
   * instance-ui-state and must not be overridden here).
   */
  autoRun?: boolean | null;
}

export interface MergedValueMappings {
  merged: ValueMappingMap;
  /** key → name of the layer that supplied the winning mapping. */
  provenance: Record<string, string>;
  /** Non-empty layers that contributed zero winning keys. */
  inertLayers: string[];
  /** Merged per-target write-policy overrides (empty when no layer set any). */
  writePolicies: WritePolicyMap;
  /**
   * The winning layer's auto-run answer, or null when no layer declared one.
   * Null is NOT false: it means "these layers have no opinion", which is what
   * lets the launcher fall through to its own default.
   */
  autoRun: boolean | null;
  /** Name of the layer that supplied `autoRun` (null when none did). */
  autoRunProvenance: string | null;
}

export function mergeValueMappingLayers(
  layers: MappingLayer[],
): MergedValueMappings {
  const merged: ValueMappingMap = {};
  const provenance: Record<string, string> = {};
  const writePolicies: WritePolicyMap = {};
  let autoRun: boolean | null = null;
  let autoRunProvenance: string | null = null;
  for (const layer of layers) {
    if (layer.autoRun === true || layer.autoRun === false) {
      autoRun = layer.autoRun;
      autoRunProvenance = layer.name;
    }
    if (layer.writePolicies) {
      for (const [target, policy] of Object.entries(layer.writePolicies)) {
        if (policy === "manual" || policy === "ask" || policy === "auto") {
          writePolicies[target] = policy;
        }
      }
    }
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
        !winners.has(l.name) &&
        // A layer whose mappings all lost but whose auto-run answer WON is not
        // inert — it decided the one thing the user will actually notice.
        autoRunProvenance !== l.name,
    )
    .map((l) => l.name);
  return {
    merged,
    provenance,
    inertLayers,
    writePolicies,
    autoRun,
    autoRunProvenance,
  };
}
