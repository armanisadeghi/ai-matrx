// /education/quizzes/[id]/results — scored results (?r=<resultId>).
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { AssessmentResults } from "@/features/education/assessment/components/results/AssessmentResults";
import { AssessmentDetail } from "@/features/education/assessment/components/AssessmentDetail";

export const metadata: Metadata = toolMetadata("quizzes");

export default async function QuizResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const r = typeof sp.r === "string" ? sp.r : null;
  // No specific result id → fall back to the detail (which lists attempts).
  if (!r) return <AssessmentDetail assessmentId={id} />;
  return <AssessmentResults assessmentId={id} resultId={r} />;
}
