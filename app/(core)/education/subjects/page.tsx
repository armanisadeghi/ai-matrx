import { createRouteMetadata } from "@/utils/route-metadata";
import { AxisIndex } from "@/features/education/components/AxisIndex";
import { SUBJECTS } from "@/features/education/data/subjects";

export const metadata = createRouteMetadata("/education", {
  titlePrefix: "Subjects",
  title: "Education",
  description:
    "Study any subject with AI — math, science, history, languages, and more. Flashcards, quizzes, and a tutor grounded in your own materials.",
  letter: "Es",
});

export default function EducationSubjectsPage() {
  return <AxisIndex axisId="subjects" entries={SUBJECTS} heroTitle="Subjects" heroAccent="every one of them" />;
}
