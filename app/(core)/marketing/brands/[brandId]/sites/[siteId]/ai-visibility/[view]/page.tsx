import { Suspense } from "react";
import { notFound } from "next/navigation";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import {
  isAiVisibilityEvidenceView,
  isAiVisibilityPanelsView,
} from "@/features/marketing/seo/ai-visibility/evidence-views";
import { SiteAiVisibilityWorkspace } from "@/features/marketing/seo/ai-visibility/SiteAiVisibilityWorkspace";
import { SiteAiVisibilityPanels } from "@/features/marketing/seo/ai-visibility/panels/SiteAiVisibilityPanels";

export default async function MarketingAiVisibilityEvidencePage({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;

  // Panels read a different table and answer a different question (presence
  // over time, from a saved prompt set) — so they get their own component
  // rather than a fifth column set inside the evidence table.
  if (isAiVisibilityPanelsView(view)) {
    return (
      <Suspense fallback={<LoadingSurface label="Loading prompt panels…" />}>
        <SiteAiVisibilityPanels />
      </Suspense>
    );
  }

  if (!isAiVisibilityEvidenceView(view)) notFound();

  return (
    <Suspense
      fallback={<LoadingSurface label="Loading AI visibility evidence…" />}
    >
      <SiteAiVisibilityWorkspace evidenceView={view} />
    </Suspense>
  );
}
