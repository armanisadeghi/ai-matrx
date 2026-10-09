import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { ClassTestView } from "@/features/education/classes/components/ClassTestView";

export const metadata: Metadata = toolMetadata("classes");

export default async function ClassTestPage({
  params,
}: {
  params: Promise<{ classId: string; testId: string }>;
}) {
  const { classId, testId } = await params;
  return <ClassTestView classId={classId} testId={testId} />;
}
