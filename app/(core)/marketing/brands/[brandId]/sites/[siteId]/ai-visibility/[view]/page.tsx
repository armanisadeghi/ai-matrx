import { Suspense } from "react";
import { notFound } from "next/navigation";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { isAiVisibilityEvidenceView } from "@/features/marketing/seo/ai-visibility/evidence-views";
import { SiteAiVisibilityWorkspace } from "@/features/marketing/seo/ai-visibility/SiteAiVisibilityWorkspace";

export default async function MarketingAiVisibilityEvidencePage({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  if (!isAiVisibilityEvidenceView(view)) notFound();

  return (
    <Suspense
      fallback={<LoadingSurface label="Loading AI visibility evidence…" />}
    >
      <SiteAiVisibilityWorkspace evidenceView={view} />
    </Suspense>
  );
}
