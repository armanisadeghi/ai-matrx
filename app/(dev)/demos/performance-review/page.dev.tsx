import { createRouteMetadata } from "@/utils/route-metadata";
import PerformanceReviewApp from "@/features/employee-performance-reviews/components/PerformanceReviewApp";

// Server component (SSR). Only the interactive tree below ships as client JS.
export const metadata = createRouteMetadata("/demos/performance-review", {
  titlePrefix: "Performance Review",
  title: "Demos",
  description:
    "Employee performance review builder with responsibilities, ratings, narrative sections, and a polished two-page PDF report.",
  letter: "PR",
});

export default function PerformanceReviewDemoPage() {
  return <PerformanceReviewApp />;
}
