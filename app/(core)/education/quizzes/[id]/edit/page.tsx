// /education/quizzes/[id]/edit — authoring surface, gated to EDIT (P7 useAccess).
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { AssessmentEdit } from "@/features/education/assessment/components/edit/AssessmentEdit";

export const metadata: Metadata = toolMetadata("quizzes");

export default async function QuizEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AssessmentEdit assessmentId={id} />;
}
