import { createRouteMetadata } from "@/utils/route-metadata";
import { AxisIndex } from "@/features/education/components/AxisIndex";
import { FEATURES } from "@/features/education/data/features";

export const metadata = createRouteMetadata("/education", {
  titlePrefix: "Features",
  title: "Education",
  description:
    "What makes AI Matrx different — FastFire spoken recall, a context-aware tutor, voice everywhere, grading of spoken/written/handwritten work, and broadcast-quality audio study.",
  letter: "Ef",
  canonicalPath: "/education/features",
});

export default function EducationFeaturesPage() {
  return <AxisIndex axisId="features" entries={FEATURES} heroTitle="Features" heroAccent="that set us apart" />;
}
