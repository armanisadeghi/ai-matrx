import { Suspense } from "react";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { KeywordIntelligenceHub } from "@/features/marketing/seo/hub/KeywordIntelligenceHub";

export const metadata = {
  title: "Keyword Intelligence",
  description:
    "Every screen that gives your keywords meaning, for every website you run.",
};

export default function KeywordIntelligencePage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading your websites…" />}>
      <KeywordIntelligenceHub />
    </Suspense>
  );
}
