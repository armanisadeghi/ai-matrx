// `/hr/performance/respond/[trackId]` — a respondent's own half of a 360 review, in the review editor.

import { Suspense } from "react";

import { Review360RespondPage } from "@/features/employee-performance-reviews/review-360/Review360Pages";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";

export const metadata = { title: "Complete your review" };

export default async function HrPerformanceRespondPage({ params }: { params: Promise<{ trackId: string }> }) {
  const { trackId } = await params;
  return (
    <>
      <RecordPageHeader backHref="/hr" parents={[{ label: "HR", href: "/hr" }]} record={{ name: "Complete your review" }} />
      <Suspense fallback={<div className="h-full animate-pulse bg-card/40" aria-label="Loading your review" />}>
        <Review360RespondPage trackId={trackId} />
      </Suspense>
    </>
  );
}
