import { Suspense } from "react";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { TopicTreeWorkbench } from "@/features/marketing/seo/value-system/topics/TopicTreeWorkbench";

/**
 * Topic Tree Builder — parent-child ancestor pinning + per-topic worth.
 * The half of the keyword value system that lets a human BUILD the tree the
 * resolver has always walked. SoR:
 * common-docs/systems/marketing/seo/seo-keywords/value-system.md
 */
export default function TopicTreePage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading the topic tree…" />}>
      <TopicTreeWorkbench />
    </Suspense>
  );
}
