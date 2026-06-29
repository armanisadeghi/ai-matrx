import { createRouteMetadata } from "@/utils/route-metadata";
import { AxisIndex } from "@/features/education/components/AxisIndex";
import { STUDY_AIDS } from "@/features/education/data/study-aids";

export const metadata = createRouteMetadata("/education", {
  titlePrefix: "Study Aids",
  title: "Education",
  description:
    "Every way to study — flashcards, quizzes, practice tests, audio podcasts, mind maps, mnemonics, and smart notes, all generated from your own material.",
  letter: "Ea",
  canonicalPath: "/education/study-aids",
});

export default function EducationStudyAidsPage() {
  return <AxisIndex axisId="study-aids" entries={STUDY_AIDS} heroTitle="Study Aids" heroAccent="every kind" />;
}
