// /education/practice-tests/new — configure + generate a timed practice test.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { AssessmentCreate } from "@/features/education/assessment/components/create/AssessmentCreate";

export const metadata: Metadata = toolMetadata("practice-tests");

export default function PracticeTestNewPage() {
  return <AssessmentCreate kind="practice_test" />;
}
