// `/hr/performance/360` — the 360 review TRIAL: the HR manager's 360 reviews (lane HR-360). A separate
// process from the standard performance review at `/hr/performance`; started from an employee's HR profile.

import { Suspense } from "react";

import { Review360ListPage } from "@/features/employee-performance-reviews/review-360/Review360Pages";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/hr/performance/360", {
  title: "360 review (trial)",
  description: "360 reviews and their outcomes.",
});

export default function HrPerformance360Page() {
  return (
    <>
      <RecordPageHeader
        backHref="/hr/performance"
        parents={[
          { label: "HR", href: "/hr" },
          { label: "Performance", href: "/hr/performance" },
        ]}
        record={{ name: "360 review (trial)" }}
      />
      <Suspense fallback={<div className="h-full animate-pulse bg-card/40" aria-label="Loading 360 reviews" />}>
        <Review360ListPage />
      </Suspense>
    </>
  );
}
