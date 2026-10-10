// `/hr/performance/reviews/[reviewId]` — one standard performance review, role-aware: the employee's
// self form, the manager's form, the comparison, share, acknowledge and reopen.

import { Suspense } from "react";

import { ReviewWorkspace } from "@/features/employee-performance-reviews/standard/ReviewWorkspace";
import { HrLoading } from "@/features/hr/shared/HrStates";

export const metadata = { title: "Performance review" };

export default async function HrPerformanceReviewWorkspacePage({ params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  return (
    <>
      <Suspense fallback={<HrLoading variant="panel" rows={6} />}>
        <ReviewWorkspace reviewId={reviewId} />
      </Suspense>
    </>
  );
}
