// `/hr/performance/[reviewId]/meeting` — the 360 review meeting held in person: the same
// side-by-side panel the Meet call opens (app panel `hr.review_360`), full page.

import { Suspense } from "react";

import { Review360InPersonPage } from "@/features/employee-performance-reviews/review-360/Review360InPerson";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";

export const metadata = { title: "360 review meeting" };

export default async function HrPerformanceReviewMeetingPage({ params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  return (
    <>
      <RecordPageHeader
        backHref={`/hr/performance/${reviewId}`}
        parents={[{ label: "HR", href: "/hr" }, { label: "360 review (trial)", href: "/hr/performance/360" }]}
        record={{ name: "Review meeting" }}
      />
      <Suspense fallback={<div className="h-full animate-pulse bg-card/40" aria-label="Loading the review" />}>
        <Review360InPersonPage reviewId={reviewId} />
      </Suspense>
    </>
  );
}
