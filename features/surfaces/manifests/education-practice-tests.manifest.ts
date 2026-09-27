/**
 * Surface manifest — Practice Tests (`matrx-user/education-practice-tests`),
 * the /education/practice-tests list. Built by `_assessment-list.manifest.ts`,
 * shared with the Quizzes list; one practice test's own views keep
 * `matrx-user/education-assessment`.
 */

import type { SurfaceManifest } from "@/features/surfaces/types";
import { buildAssessmentListManifest } from "./_assessment-list.manifest";

export const educationPracticeTestsManifest: SurfaceManifest = buildAssessmentListManifest({
  surfaceName: "matrx-user/education-practice-tests",
  label: "Practice Tests",
  noun: "practice test",
  plural: "practice tests",
  targetPlural: "practice_tests",
  urlPattern: "/education/practice-tests",
});
