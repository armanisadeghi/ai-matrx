// features/ai-models/preferredModelChoice.ts
//
// A preferred default model is a (model, class) pair: a model offered as
// Matrx Fast and Matrx Lightning is two products, and the class rides beside
// the model as `offering_id` (LLMParams.offering_id) or the server runs the
// model's preferred class. The class lives in the model knob's companion
// (`lib/scoped-config/modelClassCompanion.ts`), written by the settings row at
// the same rung as the model.
//
// The two knobs resolve independently, so a class can outlive its model (an
// organization moves its model while a person's own model stays). A class
// that does not belong to the resolved model is dropped LOUDLY — never sent,
// because the server refuses a pin that is not an offering of the model.

import { classPinOf, modelClassKnobFor } from "@/lib/scoped-config/modelClassCompanion";
import { resolveSessionKnob } from "@/lib/scoped-config/sessionKnob";
import { createClient } from "@/utils/supabase/client";

export type PreferredModelChoice = {
  modelId: string;
  /** The chosen class's `ai.offering` id; null = the model's preferred class. */
  offeringId: string | null;
};

/** The model an `ai.offering` serves, read from the public offering view. */
async function modelOfOffering(offeringId: string): Promise<string | null> {
  const { data, error } = await createClient()
    .schema("ai")
    .from("model_offering")
    .select("model_id")
    .eq("offering_id", offeringId)
    .maybeSingle();
  if (error) throw new Error(`Reading offering ${offeringId} failed: ${error.message}`);
  return (data as { model_id: string | null } | null)?.model_id ?? null;
}

/**
 * Resolve a default-model knob and its class companion for this session.
 * Null when no model is set. A read failure of the class answers the model
 * alone (announced) — a run never blocks on a preference.
 */
export async function resolvePreferredModelChoice(
  modelKnob: string,
  tag: string,
): Promise<PreferredModelChoice | null> {
  const modelValue = await resolveSessionKnob(modelKnob);
  const modelId =
    typeof modelValue === "string" && modelValue.trim() !== "" ? modelValue : null;
  if (!modelId) return null;
  const classKnob = modelClassKnobFor(modelKnob);
  if (!classKnob) return { modelId, offeringId: null };
  try {
    const offeringId = classPinOf(await resolveSessionKnob(classKnob.fullKey));
    if (!offeringId) return { modelId, offeringId: null };
    const servedModel = await modelOfOffering(offeringId);
    if (servedModel !== modelId) {
      console.error(
        `[${tag}] ${classKnob.fullKey} = ${offeringId} is not a class of ${modelKnob} = ${modelId} ` +
          `(it serves ${servedModel ?? "no live model"}) — the model's preferred class runs. ` +
          "Pick the class again in Settings.",
      );
      return { modelId, offeringId: null };
    }
    return { modelId, offeringId };
  } catch (error) {
    console.error(
      `[${tag}] ${classKnob.fullKey} could not be resolved — the model's preferred class runs:`,
      error,
    );
    return { modelId, offeringId: null };
  }
}
