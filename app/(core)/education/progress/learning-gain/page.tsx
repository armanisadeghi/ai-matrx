// /education/progress/learning-gain — the pre/post learning-gain report (P5).
// Reads P1's baseline/post rows (seed fixtures until P1's table lands) and
// renders per-subject deltas + normalized gain with a print/PDF export.
import type { Metadata } from "next";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import { LearningGainReportView } from "@/features/education/study/learning-gain/components/LearningGainReportView";

export const metadata: Metadata = createDynamicRouteMetadata("/education", {
  titlePrefix: "Study",
  title: "Learning-Gain Report",
  description:
    "Your measured pre/post improvement — proof the studying is working.",
  letter: "Lg",
  canonicalPath: "/education/progress/learning-gain",
});

export default function LearningGainPage() {
  return <LearningGainReportView backHref="/education/progress" />;
}
