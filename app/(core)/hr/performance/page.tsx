// `/hr/performance` — the HR manager's 360 reviews (lane HR-360). Started from an employee's HR profile.

import { Suspense } from "react";

import { Review360ListPage } from "@/features/employee-performance-reviews/review-360/Review360Pages";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/hr/performance", {
  title: "Performance",
  description: "360 reviews and their outcomes.",
});

export default function HrPerformancePage() {
  return (
    <>
      <RecordPageHeader backHref="/hr" parents={[{ label: "HR", href: "/hr" }]} record={{ name: "360 reviews" }} />
      <Suspense fallback={<div className="h-full animate-pulse bg-card/40" aria-label="Loading 360 reviews" />}>
        <Review360ListPage />
      </Suspense>
    </>
  );
}
