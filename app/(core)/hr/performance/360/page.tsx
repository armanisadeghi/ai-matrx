// `/hr/performance/360` — the 360 review TRIAL: the HR manager's 360 reviews (lane HR-360). A separate
// process from the standard performance review at `/hr/performance`; started from an employee's HR profile.

import { hrHref, hrPerformanceHref } from "@/features/hr/routes";
import { Suspense } from "react";

import { Review360ListPage } from "@/features/employee-performance-reviews/review-360/Review360Pages";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/hr/performance/360", {
  title: "360 review (trial)",
  description: "360 reviews and their outcomes.",
});

export default async function HrPerformance360Page({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const org = (await searchParams).org;
  return (
    <>
      <RecordPageHeader
        backHref={hrPerformanceHref(org)}
        parents={[
          { label: "HR", href: hrHref(org) },
          { label: "Performance", href: hrPerformanceHref(org) },
        ]}
        record={{ name: "360 review (trial)" }}
      />
      <Suspense fallback={<div className="h-full animate-pulse bg-card/40" aria-label="Loading 360 reviews" />}>
        <Review360ListPage />
      </Suspense>
    </>
  );
}
