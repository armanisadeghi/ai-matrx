// /education/progress — the unified cross-mode progress dashboard (P5). Server
// shell → the StudyAnalyticsDashboard client island over the whole study spine
// (mastery, accuracy, weak areas, trends, AI narrative, learning-gain teaser).
import type { Metadata } from "next";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import { StudyAnalyticsDashboard } from "@/features/education/study/analytics/components/StudyAnalyticsDashboard";

export const metadata: Metadata = createDynamicRouteMetadata("/education", {
  titlePrefix: "Study",
  title: "Your Progress",
  description:
    "Your cross-mode study analytics: mastery, accuracy, weak areas, trends, and what to study next.",
  letter: "Pr",
  canonicalPath: "/education/progress",
});

export default function EducationProgressPage() {
  return <StudyAnalyticsDashboard backHref="/education" />;
}
