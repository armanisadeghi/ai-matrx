// lib/scoped-config/modelClassCompanion.ts
//
// A model offered in several CLASSES (Matrx Fast, Matrx Lightning, ...) is
// several products, so a "default model" knob is only half a choice. Each
// default-model knob has a sibling `<…>_offering` knob holding the chosen
// class's `ai.offering` id, written at the SAME rung as the model by the model
// row itself (`KnobOverrideRow`) — never as a row of its own.
//
// The sibling declares itself on `platform.feature_knob.ui.companion_of`
// (the model key it belongs to); generic settings lists drop every companion
// knob through `isCompanionKnob`, and the model row reads/writes it here.
//
// Stored values: a uuid = that class; "" = "the model's preferred class",
// written explicitly only when a rung above holds a class this rung must not
// inherit; null (no override) = inherit.

import type { ScopedKnob } from "./types";

const MODEL_PREFS_FEATURE = "agents.model_prefs";

/** Model knob full key → its class knob's key (same feature). */
const CLASS_KEY_BY_MODEL_KEY: Readonly<Record<string, string>> = {
  [`${MODEL_PREFS_FEATURE}.chat_default_model`]: "chat_default_offering",
  [`${MODEL_PREFS_FEATURE}.agent_authoring_default_model`]:
    "agent_authoring_default_offering",
  [`${MODEL_PREFS_FEATURE}.decision_default_model`]: "decision_default_offering",
};

/** The class knob's address for a model knob, or null when it has none. */
export function modelClassKnobFor(
  modelFullKey: string,
): { feature: string; key: string; fullKey: string } | null {
  const key = CLASS_KEY_BY_MODEL_KEY[modelFullKey];
  if (!key) return null;
  return { feature: MODEL_PREFS_FEATURE, key, fullKey: `${MODEL_PREFS_FEATURE}.${key}` };
}

/** True for a knob that is rendered only through the row it is a companion of. */
export function isCompanionKnob(knob: Pick<ScopedKnob, "ui">): boolean {
  const companionOf = knob.ui?.companion_of;
  return typeof companionOf === "string" && companionOf !== "";
}

/** A stored class value as a pin: a non-empty string, else undefined. */
export function classPinOf(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
