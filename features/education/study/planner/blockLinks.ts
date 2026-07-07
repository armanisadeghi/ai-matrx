// features/education/study/planner/blockLinks.ts
//
// Maps a plan block to a deep link into the right study surface + a Lucide icon,
// so a block in the agenda takes the learner straight to studying it. Topic is
// passed through as a query param where the target surface supports it.

import {
  CalendarClock,
  Flame,
  GraduationCap,
  ListChecks,
  FileCheck2,
  Coffee,
  BookOpen,
  type LucideIcon,
} from "lucide-react";
import type { PlanBlockKind, PlanTargetRef } from "./types";

/** The route a block links into. Rest blocks have no link. */
export function blockHref(
  kind: PlanBlockKind,
  targetRef: PlanTargetRef | null | undefined,
): string | null {
  const topic = targetRef?.topic;
  const topicQ = topic ? `?topic=${encodeURIComponent(topic)}` : "";
  switch (kind) {
    case "review":
      return "/education/flashcards/review";
    case "weak_area":
      return `/education/flashcards/weak-areas${topicQ}`;
    case "learn":
      return "/education/flashcards";
    case "quiz":
      return "/education/quizzes";
    case "practice_test":
      return "/education/practice-tests";
    case "rest":
      return null;
    case "custom":
    default:
      return targetRef?.href ?? null;
  }
}

export function blockIcon(kind: PlanBlockKind): LucideIcon {
  switch (kind) {
    case "review":
      return CalendarClock;
    case "weak_area":
      return Flame;
    case "learn":
      return BookOpen;
    case "quiz":
      return ListChecks;
    case "practice_test":
      return FileCheck2;
    case "rest":
      return Coffee;
    default:
      return GraduationCap;
  }
}

/** Short human label for a block kind (for chips / accents). */
export function blockKindLabel(kind: PlanBlockKind): string {
  switch (kind) {
    case "review":
      return "Review";
    case "weak_area":
      return "Weak area";
    case "learn":
      return "Learn";
    case "quiz":
      return "Quiz";
    case "practice_test":
      return "Practice test";
    case "rest":
      return "Rest";
    default:
      return "Study";
  }
}
