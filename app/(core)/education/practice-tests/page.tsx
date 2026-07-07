// /education/practice-tests — the Practice Tests home (list-first "savior" view).
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { AssessmentHome } from "@/features/education/assessment/components/AssessmentHome";
import { PRACTICE_TEST_CONFIG } from "@/features/education/assessment/components/kindConfig";

export const metadata: Metadata = toolMetadata("practice-tests");

export default function PracticeTestsToolPage() {
  return <AssessmentHome config={PRACTICE_TEST_CONFIG} />;
}
