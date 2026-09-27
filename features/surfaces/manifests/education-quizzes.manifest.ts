/**
 * Surface manifest — Quizzes (`matrx-user/education-quizzes`), the
 * /education/quizzes list. Built by `_assessment-list.manifest.ts`, shared with
 * the Practice Tests list; one quiz's own views keep
 * `matrx-user/education-assessment`.
 */

import type { SurfaceManifest } from "@/features/surfaces/types";
import { buildAssessmentListManifest } from "./_assessment-list.manifest";

export const educationQuizzesManifest: SurfaceManifest = buildAssessmentListManifest({
  surfaceName: "matrx-user/education-quizzes",
  label: "Quizzes",
  noun: "quiz",
  plural: "quizzes",
  targetPlural: "quizzes",
  urlPattern: "/education/quizzes",
});
