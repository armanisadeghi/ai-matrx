"use client";

// features/education/home/nudges.ts
//
// THE ONE NUDGE.
//
// A study platform with sixteen tools has an obvious failure mode: show a
// learner everything they are not using, and the page becomes a wall of things
// they have not earned. That reads as pressure, not invitation, and it is the
// fastest way to make someone close the tab.
//
// So there is exactly one nudge shape on the home, and it is always about the
// learner's OWN material: this kit has flashcards and a summary but no quiz —
// here is a chip that makes the quiz. It arrives attached to the thing it is
// about, it is one click, and it disappears the moment the kit is complete.
// Never a grid of locked features, never a badge count of what is missing.

import { ALL_TARGET_KINDS } from "../convert/types";
import type { TargetKind } from "../convert/types";
import {
  TARGET_PRESENTATION,
  type TargetPresentation,
} from "../convert/targetPresentation";
import { kitAddHref, type StudyKit } from "../kits/kitService";

/**
 * Formats we offer to add to an existing kit, in the order a learner benefits
 * from them. Practice beats reading, reading beats listening.
 *
 * `notes` is deliberately absent: a note is something the learner writes, not
 * something we should nudge them to generate.
 */
const NUDGEABLE: TargetKind[] = [
  "deck",
  "quiz",
  "practice_test",
  "summary",
  "mind_map",
  "memory_aid",
  "audio",
];

/** At most this many chips on one kit — three is a suggestion, seven is a list. */
const MAX_CHIPS = 3;

export interface NudgeOption {
  target: TargetKind;
  visual: TargetPresentation;
  /**
   * The real per-format generate for THIS material (`kitAddHref` — the kit hub
   * with its convert surface open on this target). The chip states a true fact
   * ("this kit has no quiz") and lands on the one action that fixes it,
   * grounded in the kit's own source rather than a second upload.
   *
   * It opens the picker; it does not auto-run. Generation spends the learner's
   * quota, so the last tap stays theirs — and a link that spent it on page load
   * would spend it again on every refresh.
   */
  href: string;
}

/** Which converter targets a kit already contains. */
function presentTargets(kit: StudyKit): Set<string> {
  const present = new Set<string>();
  for (const artifact of kit.artifacts) {
    if (artifact.targetKind) present.add(artifact.targetKind);
  }
  return present;
}

/** The formats this kit does NOT have yet, highest-value first. */
export function missingFormatsFor(kit: StudyKit): NudgeOption[] {
  const present = presentTargets(kit);
  return NUDGEABLE.filter((target) => !present.has(target))
    .slice(0, MAX_CHIPS)
    .map((target) => ({
      target,
      visual: TARGET_PRESENTATION[target],
      href: kitAddHref(kit.sourceType, kit.sourceId, target),
    }));
}

/** Every target a kit could still gain — used for "N more available" copy. */
export function missingCountFor(kit: StudyKit): number {
  const present = presentTargets(kit);
  return ALL_TARGET_KINDS.filter(
    (target) => target !== "notes" && !present.has(target),
  ).length;
}
