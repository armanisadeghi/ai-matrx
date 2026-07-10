// /education/quizzes/new — generate a quiz (topic / deck / document).
import type { Metadata } from "next";
import { Suspense } from "react";
import { toolMetadata } from "@/features/education/route-helpers";
import { AssessmentCreate } from "@/features/education/assessment/components/create/AssessmentCreate";

export const metadata: Metadata = toolMetadata("quizzes");

export default function QuizNewPage() {
  // Suspense boundary is required: AssessmentCreate reads useSearchParams for the
  // exam-hub deep-link prefill (?examType=&topic=&depth=).
  return (
    <Suspense fallback={null}>
      <AssessmentCreate kind="quiz" />
    </Suspense>
  );
}
