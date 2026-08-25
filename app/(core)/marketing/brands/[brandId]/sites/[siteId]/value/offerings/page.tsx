import { Suspense } from "react";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { TopicTreeWorkbench } from "@/features/marketing/seo/value-system/topics/TopicTreeWorkbench";

/** The Offering tree: the user-facing name for the shared `seo.topic` hierarchy. */
export default function OfferingTreePage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading the offering tree…" />}>
      <TopicTreeWorkbench />
    </Suspense>
  );
}
