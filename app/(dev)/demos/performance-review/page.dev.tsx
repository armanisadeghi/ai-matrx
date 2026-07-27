import { createRouteMetadata } from "@/utils/route-metadata";
import PerformanceReviewApp from "./PerformanceReviewApp";

// Server component (SSR). Only the interactive tree below ships as client JS.
export const metadata = createRouteMetadata("/demos/performance-review", {
  titlePrefix: "Performance Review",
  title: "Demos",
  description:
    "Employee performance review builder — capture ratings, strengths, goals and comments. Saves multiple reviews to local storage.",
  letter: "PR",
});

export default function PerformanceReviewDemoPage() {
  return <PerformanceReviewApp />;
}
