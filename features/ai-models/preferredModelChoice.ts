// features/ai-models/preferredModelChoice.ts
//
// A preferred default model is a (model, class) pair — the resolver now lives in
// `@ai-matrx/agents/models` (`resolvePreferredModelChoice`, agent core A1). This file binds the
// APP's settings ladder (`lib/scoped-config`) to the package's ports and nothing else.

import {
  resolvePreferredModelChoice as resolveInPackage,
  type ModelCatalogClient,
  type PreferredModelChoice,
} from "@ai-matrx/agents/models";
import { classPinOf, modelClassKnobFor } from "@/lib/scoped-config/modelClassCompanion";
import { resolveSessionKnob } from "@/lib/scoped-config/sessionKnob";
import { createClient } from "@/utils/supabase/client";

export type { PreferredModelChoice };

/**
 * Resolve a default-model knob and its class companion for this session.
 * Null when no model is set. A read failure of the class answers the model
 * alone (announced) — a run never blocks on a preference.
 */
export function resolvePreferredModelChoice(
  modelKnob: string,
  tag: string,
): Promise<PreferredModelChoice | null> {
  return resolveInPackage(
    {
      client: () => createClient() as unknown as ModelCatalogClient,
      resolveKnob: (fullKey) => resolveSessionKnob(fullKey),
      classKnobFor: (knob) => modelClassKnobFor(knob),
      classPinOf: (value) => classPinOf(value),
    },
    modelKnob,
    tag,
  );
}
