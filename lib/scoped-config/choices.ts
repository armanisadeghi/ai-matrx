// lib/scoped-config/choices.ts
//
// THE ONE PLACE A SETTING'S CHOICES GET THEIR WORDS.
//
// 🚨 WHAT THIS EXISTS FOR (lane FRONT-DOOR, 2026-09-21; the defect is
// VERIFIER-8 MEDIUM-2). `/data-v2/try-everything` printed, in its header, to a
// non-technical person:
//
//     Set to "all_records", which this screen has no words for
//
// The screen carried its own copy of the choices for
// `custom.member_default_visibility` — a two-row array typed into the
// component — and that copy had invented a value (`organization`) the registry
// does not admit and missed the one it does (`all_records`). So the lookup
// missed and the stored token went on screen verbatim.
//
// THE CLASS, not the instance: a screen holding its own copy of an enum's words
// instead of reading them from the one place they live. The registry already
// carries them — `platform.feature_knob.ui.options` is `[{value,label,help?}]`
// and six live keys populate it today (cloud browser session verification,
// Workflow Studio, Google, Personal Staff) — but nothing in this repo read it,
// so every enum control in the product either printed the raw token
// (`KnobOverrideRow`'s select: `hash_only`) or prettified it client-side
// (`humanize("hash_only")` → "Hash only"), and "Fast (recommended)", written
// into the registry by the person who owns the setting, never reached a screen.
//
// So: ONE function turns a knob row into the choices a control renders, and
// every label it returns came from the registry when the registry has one. A
// screen never declares a choice list for a knob, and never invents a word.
//
// Falling back. A key whose registry row carries no `ui.options` still has to
// render, so its token is prettified mechanically — and `fromRegistry: false`
// says so on the choice, which is what the guard
// `pnpm check:enum-words-live-in-the-registry` and the settings-completeness
// panel read. A mechanical prettifier is a stopgap that announces itself, never
// a second home for the words.

import type { ScopedKnob } from "./types";

/** One choice a control offers, with the words a person reads. */
export type KnobChoice = {
  /** The value written back, as a string (the raw is kept for the write). */
  value: string;
  /** What the person reads. From the registry whenever the registry has it. */
  label: string;
  /** One extra sentence under the choice, when the registry carries one. */
  help?: string;
  /** The value in its registry type — booleans stay booleans on the write. */
  raw: unknown;
  /** `false` means nobody has written words for this value yet. */
  fromRegistry: boolean;
};

/** "not_set" → "Not set". A stopgap, never a home for words — see the header. */
function mechanicalWords(raw: string): string {
  const words = raw.replace(/[_-]+/g, " ").trim();
  if (words === "") return raw;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * THE choices for one knob, in the registry's own order.
 *
 * Booleans are On / Off — there is nothing in the registry to read, and the
 * committed value stays a boolean because `knob_override_set` validates the
 * JSON type it is handed.
 *
 * Anything else reads `allowed_values` for WHICH values are admissible and
 * `ui.options` for WHAT EACH ONE IS CALLED. An `ui.options` entry for a value
 * that is not admissible is ignored: the admissible set is the registry's
 * `allowed_values` and nothing else decides it.
 */
export function knobChoices(knob: ScopedKnob): KnobChoice[] {
  if (knob.value_type === "boolean") {
    return [
      { value: "true", label: "On", raw: true, fromRegistry: true },
      { value: "false", label: "Off", raw: false, fromRegistry: true },
    ];
  }
  const words = new Map<string, { label: string; help?: string }>();
  for (const option of knob.ui?.options ?? []) {
    if (typeof option?.value !== "string" || typeof option?.label !== "string") continue;
    words.set(option.value, { label: option.label, help: option.help });
  }
  return (knob.allowed_values ?? []).map((raw) => {
    const value = String(raw);
    const fromRegistry = words.get(value);
    return {
      value,
      label: fromRegistry?.label ?? mechanicalWords(value),
      help: fromRegistry?.help,
      raw,
      fromRegistry: Boolean(fromRegistry),
    };
  });
}

/**
 * The words for ONE value of a knob — what a screen shows when it is reporting
 * the current setting in a sentence rather than offering the choices.
 *
 * `null` means the value is not one the registry admits, which is a real answer
 * and never a token printed at a person: the caller says so in its own words
 * ("this organization is set to something this build does not recognise"), it
 * does not paste the stored key into a sentence.
 */
export function knobChoiceLabel(knob: ScopedKnob, value: unknown): string | null {
  if (value === undefined) return null;
  const match = knobChoices(knob).find((choice) => choice.value === String(value));
  return match ? match.label : null;
}
