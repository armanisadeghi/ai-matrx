import type { Metadata } from "next";
import { EduToolComingSoon } from "@/features/education/components/EduToolComingSoon";
import { toolMetadata } from "@/features/education/route-helpers";

export const metadata: Metadata = toolMetadata("quizzes");

export default function QuizResultsPage() {
  return <EduToolComingSoon slug="quizzes" surface={{ label: "Quiz results", gate: "view" }} />;
}
