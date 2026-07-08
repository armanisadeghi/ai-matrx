// /education/practice-tests/[id]/edit — authoring surface, gated to EDIT.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { AssessmentEdit } from "@/features/education/assessment/components/edit/AssessmentEdit";

export const metadata: Metadata = toolMetadata("practice-tests");

export default async function PracticeTestEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AssessmentEdit assessmentId={id} />;
}
