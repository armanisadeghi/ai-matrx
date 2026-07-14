import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { ClassHubView } from "@/features/education/classes/components/ClassHubView";

export const metadata: Metadata = toolMetadata("classes");

export default async function ClassHubPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  return <ClassHubView classParam={classId} />;
}
