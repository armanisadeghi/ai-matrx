// features/education/assessment/components/kindConfig.ts
//
// One config object driving every assessment surface by kind so quizzes and
// practice tests share ALL the UI (list / create / take / results / edit) with
// zero forked components — only labels, routes, and the metered capability
// differ. Adding a third assessment kind = one entry here.

import { ListChecks, FileCheck2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AssessmentKind } from "../data/types";
import type { Capability } from "@/features/entitlements/registry";

export interface KindConfig {
  kind: AssessmentKind;
  /** Tool slug + URL base (`/education/<base>`). */
  base: string;
  /** Singular noun ("quiz" / "practice test"). */
  noun: string;
  /** Title-case label ("Quiz" / "Practice Test"). */
  label: string;
  pluralLabel: string;
  icon: LucideIcon;
  /** The metered capability for generation (P8). */
  capability: Capability;
  /** Practice tests are timed + longer by default. */
  timed: boolean;
  defaultCount: number;
  countMax: number;
}

export const QUIZ_CONFIG: KindConfig = {
  kind: "quiz",
  base: "quizzes",
  noun: "quiz",
  label: "Quiz",
  pluralLabel: "Quizzes",
  icon: ListChecks,
  capability: "education.quiz_generate",
  timed: false,
  defaultCount: 8,
  countMax: 30,
};

export const PRACTICE_TEST_CONFIG: KindConfig = {
  kind: "practice_test",
  base: "practice-tests",
  noun: "practice test",
  label: "Practice Test",
  pluralLabel: "Practice Tests",
  icon: FileCheck2,
  capability: "education.practice_test_generate",
  timed: true,
  defaultCount: 20,
  countMax: 60,
};

export const KIND_CONFIG: Record<AssessmentKind, KindConfig> = {
  quiz: QUIZ_CONFIG,
  practice_test: PRACTICE_TEST_CONFIG,
};

export function isAssessmentKind(value: string): value is AssessmentKind {
  return Object.hasOwn(KIND_CONFIG, value);
}

/**
 * Narrow a DB `assessment_kind` string (CHECK-constrained to the
 * `AssessmentKind` union) to its config. Throws loudly on an unknown kind —
 * that means the DB CHECK and this union drifted, never a recoverable state.
 */
export function kindConfigFor(kind: string): KindConfig {
  if (!isAssessmentKind(kind)) {
    throw new Error(
      `Unknown assessment_kind "${kind}" — expected one of: ${Object.keys(KIND_CONFIG).join(", ")}. ` +
        "The education.assessment CHECK constraint and AssessmentKind drifted.",
    );
  }
  return KIND_CONFIG[kind];
}
