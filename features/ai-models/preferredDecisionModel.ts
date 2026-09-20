// features/ai-models/preferredDecisionModel.ts
//
// `agents.model_prefs.decision_default_model` — "the decision model (typed
// Choice / Score / Noul answers) that loads when you have not picked one" —
// resolved through THE settings ladder (organization → user → device, nearest
// wins; `lib/scoped-config/sessionKnob.ts`). Sibling of
// `preferredChatModel.ts`; the value is an `ai.model_definition.id`.
//
// A null/"" answer means "the catalog's first decision model": the decision
// surface then picks the first catalog row whose
// `capabilities.interaction === "decision"`, and when the catalog has none it
// leaves the picker empty and its ready-check says so (nothing silent).
//
// WHERE IT IS HONOURED: `features/ai-models/decisions/DecisionPlayground.tsx`
// seeds its model picker with this answer on mount when no model was chosen.
// Arman, 2026-09-20: the default decision model comes from the system knobs,
// never from code.

import { parseCapabilities } from "@/features/ai-models/capabilities/parse";
import { isDecisionModelCapability } from "@/features/ai-models/capabilities/types";
import type { AIModelRecord } from "@/features/ai-models/redux/modelRegistrySlice";
import { resolveSessionKnob } from "@/lib/scoped-config/sessionKnob";

export const DECISION_DEFAULT_MODEL_KNOB =
  "agents.model_prefs.decision_default_model";

/**
 * The person's preferred decision model id, or null when they (and their
 * organization) left it to the catalog. A read failure is announced and
 * answers null — the surface never blocks on a preference.
 */
export async function resolvePreferredDecisionModel(): Promise<string | null> {
  try {
    const value = await resolveSessionKnob(DECISION_DEFAULT_MODEL_KNOB);
    return typeof value === "string" && value.trim() !== "" ? value : null;
  } catch (error) {
    console.error(
      `[preferredDecisionModel] ${DECISION_DEFAULT_MODEL_KNOB} could not be resolved — the catalog's first decision model answers instead:`,
      error,
    );
    return null;
  }
}

/**
 * The catalog's fallback when the knob is unset: the FIRST active model whose
 * capabilities declare the decision contract, in the registry's stable
 * ordering (common_name asc). Null when the loaded catalog has none — the
 * caller says so on screen; nothing picks a chat model in its place.
 */
export function firstDecisionModelId(models: readonly AIModelRecord[]): string | null {
  const match = models.find((m) =>
    isDecisionModelCapability(
      parseCapabilities(m.capabilities, { modelId: m.id, modelName: m.name }),
    ),
  );
  return match?.id ?? null;
}
