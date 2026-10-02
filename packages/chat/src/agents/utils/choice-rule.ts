/**
 * THE CHOICE RULE — which control a single-select option list gets.
 *
 *   pill toggle      ≤ 4 options, each short (≤ 12 characters)
 *   select           5–12 options (or any option too long for a pill)
 *   searchable select > 12 options
 *   aspect-ratio picker  whenever the options are ratios, at any count
 *
 * A pill row that wraps is never right, and a twelve-plus list is scanned by
 * typing. Derivation (controls → run inputs) writes these types, and the
 * renderer re-applies the rule at draw time so older stored definitions
 * (a 23-option aspect-ratio pill row) render correctly without a migration.
 */

import { isAspectRatioOptionSet } from "@/components/official/aspect-ratio/aspect-ratio-options";

export const PILL_MAX_OPTIONS = 4;
export const PILL_MAX_LABEL = 12;
export const SELECT_MAX_OPTIONS = 12;

export type ChoiceControl =
  "pill-toggle" | "select" | "searchable" | "aspect-ratio";

export function fitsPills(options: readonly string[]): boolean {
  return (
    options.length > 0 &&
    options.length <= PILL_MAX_OPTIONS &&
    options.every((o) => o.length <= PILL_MAX_LABEL)
  );
}

export function choiceControlFor(options: readonly string[]): ChoiceControl {
  if (isAspectRatioOptionSet(options)) return "aspect-ratio";
  if (fitsPills(options)) return "pill-toggle";
  if (options.length > SELECT_MAX_OPTIONS) return "searchable";
  return "select";
}

/** The stored component type for a derived option list. */
export function choiceComponentType(
  options: readonly string[],
): "pill-toggle" | "select" {
  return choiceControlFor(options) === "pill-toggle" ? "pill-toggle" : "select";
}
