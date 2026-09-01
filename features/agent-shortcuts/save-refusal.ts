// features/agent-shortcuts/save-refusal.ts
//
// 🚨 WHY THE SHORTCUT EDITOR'S SAVE CANNOT ACT — one derivation, in words
// (FIX-11, W10-1).
//
// This lived inside the editor's click handler as a three-field `validate()`
// that toasted and returned. Two things were wrong with that, and they are the
// same thing said twice:
//
//   · it knew nothing about the MAPPINGS it was about to store, so a question
//     with no words saved cleanly and the run form asked nothing;
//   · it fired AFTER the click, so the button looked alive right up until it
//     wasn't — the shape the batch grids stopped doing (a refusal that flashes
//     somewhere else for four seconds is a refusal nobody can act on).
//
// It is a pure function so the gate can be proven, and so the sentences are
// read once rather than rewritten per screen.

import type { ValueMappingMap } from "@/features/surfaces/types";
import {
  valueMappingsProblems,
  type PreflightTarget,
} from "@/features/mandates/provision-shapes";

export interface ShortcutSaveState {
  label: string;
  categoryId: string | null;
  surfaceName: string | null;
  valueMappings: ValueMappingMap | null;
  /** The agent's declared inputs, so each refusal names one the way its own
   * row's header does. */
  targets: readonly PreflightTarget[];
}

/**
 * Every reason Save is refused, in the order a person would fix them — empty
 * means the shortcut may be written.
 *
 * The three field rules come first and ALONE: with no surface picked there are
 * no mappings worth talking about, and stacking five sentences on a blank draft
 * is noise rather than help. Once the frame is set, every mapping problem is
 * listed, because each one is a separate row to go and fix.
 */
export function shortcutSaveRefusals(state: ShortcutSaveState): string[] {
  if (!state.label.trim()) {
    return ["Give this shortcut a label — it is what the person sees in the menu."];
  }
  if (!state.categoryId) {
    return ["Pick a category — it decides where this shortcut appears."];
  }
  if (!state.surfaceName) {
    return ["Pick a surface — it decides where this shortcut can run."];
  }
  return valueMappingsProblems(state.valueMappings, {
    targets: state.targets,
  });
}
