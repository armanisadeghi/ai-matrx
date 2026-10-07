/**
 * WHAT THE SERVER WILL ACTUALLY FEED — the stored map plus the by-name pass.
 *
 * 🚨 Found 2026-10-06 (lane binding-honesty): with NO consumption map the run
 * door delivers every `pass_by_name` offered value to the Holder input of the
 * same name (aidream `provisions.materialize_consumption`, the default pin —
 * proved by dry runs through `POST /ai/mandates/{key}`). The Binding tab read
 * only the stored map, so ~400 mandates said "0 of N inputs are fed" about
 * inputs that arrive on every run.
 *
 * The rule, mirrored exactly from the server:
 * - a map with ANY chosen source is the whole truth — nothing arrives by name;
 * - an empty map feeds each Holder input whose name an offered value carries,
 *   unless that value is mapping-only (`pass_by_name: false`) and the Holder is
 *   an agent. An agent's CONTEXT slot is never fed this way: the default pin
 *   lands every value as a variable.
 *
 * `implicit` is written in the one writer's shape (`buildEntry`), so "Make
 * explicit" saves precisely what already runs — `when_absent` included.
 */

import { buildEntry } from "./consumption-writer";
import type { ConsumptionMap, OfferedValue } from "@/features/mandates/provisions";

export interface EffectiveConsumption {
  /** The map the server runs with right now (stored, or the by-name pass). */
  map: ConsumptionMap;
  /** Inputs fed only by name — on screen as fed, not yet in the stored map. */
  byName: ReadonlySet<string>;
  /** The by-name entries, ready to be saved as an explicit map. */
  implicit: ConsumptionMap;
}

export function effectiveConsumption({
  map,
  targetNames,
  contextKeys,
  offered,
  mappingOnly,
  holderKind,
}: {
  /** The draft with unpicked sources removed — what a save would send. */
  map: ConsumptionMap;
  targetNames: readonly string[];
  contextKeys: ReadonlySet<string>;
  offered: readonly OfferedValue[];
  /** Offered values declared `pass_by_name: false`. */
  mappingOnly?: ReadonlySet<string>;
  holderKind: "agent" | "workflow";
}): EffectiveConsumption {
  const hasStored = Object.values(map).some((sources) => sources.length > 0);
  if (hasStored) return { map, byName: new Set(), implicit: {} };

  const offeredByName = new Map(offered.map((v) => [v.name, v]));
  const implicit: ConsumptionMap = {};
  const byName = new Set<string>();
  for (const name of targetNames) {
    const value = offeredByName.get(name);
    if (!value) continue;
    if (holderKind === "agent") {
      if (mappingOnly?.has(name)) continue;
      if (contextKeys.has(name)) continue;
    }
    implicit[name] = [
      buildEntry({ sourceName: name, offered: value, deliver: "variable" }),
    ];
    byName.add(name);
  }
  return { map: implicit, byName, implicit };
}
