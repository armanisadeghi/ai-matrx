// /education/quizzes — the Quiz Builder home (list-first "savior" view).
// Server shell → the AssessmentHome client island (code-split automatically).
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { AssessmentHome } from "@/features/education/assessment/components/AssessmentHome";

export const metadata: Metadata = toolMetadata("quizzes");

export default function QuizzesToolPage() {
  return <AssessmentHome kind="quiz" />;
}
