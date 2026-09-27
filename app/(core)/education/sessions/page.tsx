// /education/sessions — the learner's study-session history across EVERY mode
// (flashcards, quizzes, drills, spoken practice…). The progress dashboard's
// Streak and Time studied tiles open it; the rows open the shared session
// detail (the study spine is mode-agnostic, so one detail route serves all).
import type { Metadata } from "next";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import { SessionsBrowser } from "@/features/education/study/components/SessionsBrowser";

export const metadata: Metadata = createDynamicRouteMetadata("/education", {
  titlePrefix: "Sessions",
  title: "Study",
  description: "Every study session you have run, across all study modes.",
  letter: "Se",
  canonicalPath: "/education/sessions",
});

export default function EducationSessionsPage() {
  return (
    <SessionsBrowser
      title="Study sessions"
      detailBasePath="/education/flashcards/sessions"
    />
  );
}
