import { createRouteMetadata } from "@/utils/route-metadata";
import { AxisIndex } from "@/features/education/components/AxisIndex";
import { EXAMS } from "@/features/education/data/exam-prep";

export const metadata = createRouteMetadata("/education", {
  titlePrefix: "Exam Prep",
  title: "Education",
  description:
    "Prep for the test that matters — SAT, ACT, AP, MCAT, LSAT, GRE, bar, NCLEX, CPA. Adaptive practice, spoken recall, and full simulated exams.",
  letter: "Ex",
  canonicalPath: "/education/exam-prep",
});

export default function EducationExamPrepPage() {
  return <AxisIndex axisId="exam-prep" entries={EXAMS} heroTitle="Exam Prep" heroAccent="pass the test" />;
}
