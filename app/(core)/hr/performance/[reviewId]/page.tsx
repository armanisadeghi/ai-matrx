// `/hr/performance/[reviewId]` — one 360 review: both halves side by side once both are in.

import { Suspense } from "react";

import { Review360ReviewPage } from "@/features/employee-performance-reviews/review-360/Review360Pages";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";

export const metadata = { title: "360 review" };

export default async function HrPerformanceReviewPage({ params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  return (
    <>
      <RecordPageHeader
        backHref="/hr/performance"
        parents={[{ label: "HR", href: "/hr" }, { label: "360 reviews", href: "/hr/performance" }]}
        record={{ name: "360 review" }}
      />
      <Suspense fallback={<div className="h-full animate-pulse bg-card/40" aria-label="Loading the review" />}>
        <Review360ReviewPage reviewId={reviewId} />
      </Suspense>
    </>
  );
}
