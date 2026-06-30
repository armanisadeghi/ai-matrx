import type { Metadata } from "next";
import { EduToolComingSoon } from "@/features/education/components/EduToolComingSoon";
import { toolMetadata } from "@/features/education/route-helpers";

export const metadata: Metadata = toolMetadata("quizzes");

// View/use surface — the shareable URL. Gated by the quiz's view access.
export default function QuizTakePage() {
  return <EduToolComingSoon slug="quizzes" surface={{ label: "Take a quiz", gate: "view" }} />;
}
