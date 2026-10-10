// `/hr/performance/[reviewId]` — one 360 review: both halves side by side once both are in.

import { hrHref, hrPerformance360Href } from "@/features/hr/routes";
import { Suspense } from "react";

import { Review360ReviewPage } from "@/features/employee-performance-reviews/review-360/Review360Pages";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";

export const metadata = { title: "360 review" };

export default async function HrPerformanceReviewPage({ params, searchParams }: { params: Promise<{ reviewId: string }>; searchParams: Promise<{ org?: string }> }) {
  const org = (await searchParams).org;
  const { reviewId } = await params;
  return (
    <>
      <RecordPageHeader
        backHref={hrPerformance360Href(org)}
        parents={[{ label: "HR", href: hrHref(org) }, { label: "360 review (trial)", href: hrPerformance360Href(org) }]}
        record={{ name: "360 review" }}
      />
      <Suspense fallback={<div className="h-full animate-pulse bg-card/40" aria-label="Loading the review" />}>
        <Review360ReviewPage reviewId={reviewId} />
      </Suspense>
    </>
  );
}
