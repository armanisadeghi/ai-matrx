import { createRouteMetadata } from "@/utils/route-metadata";
import { AxisIndex } from "@/features/education/components/AxisIndex";
import { LEVELS } from "@/features/education/data/levels";

export const metadata = createRouteMetadata("/education", {
  titlePrefix: "Levels",
  title: "Education",
  description:
    "Built for your stage — kindergarten through high school, college, and professional boards. The AI adapts complexity, tone, and format to the learner.",
  letter: "El",
});

export default function EducationLevelsPage() {
  return <AxisIndex axisId="levels" entries={LEVELS} heroTitle="Find your level" />;
}
