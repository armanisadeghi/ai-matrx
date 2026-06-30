import type { Metadata } from "next";
import { EduToolComingSoon } from "@/features/education/components/EduToolComingSoon";
import { toolMetadata } from "@/features/education/route-helpers";

export const metadata: Metadata = toolMetadata("quizzes");

export default function QuizNewPage() {
  return <EduToolComingSoon slug="quizzes" surface={{ label: "Create a quiz", gate: "auth" }} />;
}
