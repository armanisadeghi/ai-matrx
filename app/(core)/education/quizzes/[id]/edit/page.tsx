import type { Metadata } from "next";
import { EduToolComingSoon } from "@/features/education/components/EduToolComingSoon";
import { toolMetadata } from "@/features/education/route-helpers";

export const metadata: Metadata = toolMetadata("quizzes");

// Authoring surface — same [id], gated to EDIT permission (see ROUTING.md).
export default function QuizEditPage() {
  return <EduToolComingSoon slug="quizzes" surface={{ label: "Edit a quiz", gate: "edit" }} />;
}
