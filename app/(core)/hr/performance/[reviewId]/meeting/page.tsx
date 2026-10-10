// `/hr/performance/[reviewId]/meeting` — the 360 review meeting held in person: the same
// side-by-side panel the Meet call opens (app panel `hr.review_360`), full page.

import { hrHref, hrPerformance360Href, hrPerformanceReviewHref } from "@/features/hr/routes";
import { Suspense } from "react";

import { Review360InPersonPage } from "@/features/employee-performance-reviews/review-360/Review360InPerson";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";

export const metadata = { title: "360 review meeting" };

export default async function HrPerformanceReviewMeetingPage({ params, searchParams }: { params: Promise<{ reviewId: string }>; searchParams: Promise<{ org?: string }> }) {
  const org = (await searchParams).org;
  const { reviewId } = await params;
  return (
    <>
      <RecordPageHeader
        backHref={hrPerformanceReviewHref(reviewId, org)}
        parents={[{ label: "HR", href: hrHref(org) }, { label: "360 review (trial)", href: hrPerformance360Href(org) }]}
        record={{ name: "Review meeting" }}
      />
      <Suspense fallback={<div className="h-full animate-pulse bg-card/40" aria-label="Loading the review" />}>
        <Review360InPersonPage reviewId={reviewId} />
      </Suspense>
    </>
  );
}
