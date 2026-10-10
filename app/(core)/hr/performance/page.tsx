// `/hr/performance` — the STANDARD performance review: my reviews, the reviews I write, and (for an
// HR seat) the employer's review cycles. The 360 review is a separate trial at `/hr/performance/360`.

import { Suspense } from "react";

import { StandardHome } from "@/features/employee-performance-reviews/standard/StandardHome";
import { HrLoading } from "@/features/hr/shared/HrStates";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/hr/performance", {
  title: "Performance",
  description: "Performance reviews: yours, and your team's.",
});

export default function HrPerformancePage() {
  return (
    <>
      <RecordPageHeader backHref="/hr" parents={[{ label: "HR", href: "/hr" }]} record={{ name: "Performance" }} />
      <Suspense fallback={<HrLoading variant="table" rows={5} />}>
        <StandardHome />
      </Suspense>
    </>
  );
}
