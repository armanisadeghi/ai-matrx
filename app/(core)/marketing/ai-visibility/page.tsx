import type { Metadata } from "next";
import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { AiVisibilityHub } from "@/features/marketing/seo/ai-visibility/AiVisibilityHub";

export const metadata: Metadata = {
  title: "AI Visibility",
  description:
    "See what each AI assistant recommended, which sources it cited, and why every source earned attention.",
};

export default function MarketingAiVisibilityPage() {
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center">
          <h1 className="truncate text-sm font-medium text-foreground">
            AI Visibility
          </h1>
        </div>
      </PageHeader>
      <Suspense fallback={<LoadingSurface label="Loading AI visibility…" />}>
        <AiVisibilityHub />
      </Suspense>
    </>
  );
}
