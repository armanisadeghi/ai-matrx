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
import type { StudyKit } from "../kits/kitService";

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
   * The kit's own hub — where "Make more from it" lives.
   *
   * 🚨 It is deliberately NOT a per-format generate link. The kit hub's
   * "Make more from it" button currently sends the learner to the generic
   * `/education/start` ingest, which drops the kit context entirely, so there
   * is no route today that means "add a quiz to THIS material". Linking the
   * chip straight at a fabricated `?add=quiz` would promise a flow that does
   * not exist. The chip therefore states a true fact ("this kit has no quiz")
   * and opens the kit; wire it to a real per-format generate as soon as the kit
   * hub gains one, and the chip needs no other change.
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
  const kitPath = `/education/kits/${kit.sourceId}`;
  return NUDGEABLE.filter((target) => !present.has(target))
    .slice(0, MAX_CHIPS)
    .map((target) => ({
      target,
      visual: TARGET_PRESENTATION[target],
      href: kitPath,
    }));
}

/** Every target a kit could still gain — used for "N more available" copy. */
export function missingCountFor(kit: StudyKit): number {
  const present = presentTargets(kit);
  return ALL_TARGET_KINDS.filter(
    (target) => target !== "notes" && !present.has(target),
  ).length;
}
