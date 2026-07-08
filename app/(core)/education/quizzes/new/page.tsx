// /education/quizzes/new — generate a quiz (topic / deck / document).
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { AssessmentCreate } from "@/features/education/assessment/components/create/AssessmentCreate";

export const metadata: Metadata = toolMetadata("quizzes");

export default function QuizNewPage() {
  return <AssessmentCreate kind="quiz" />;
}
