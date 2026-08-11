import type { Metadata } from "next";
import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import CompetitorAutopsyWorkspace from "@/features/marketing/competitors/CompetitorAutopsyWorkspace";

export const metadata: Metadata = {
  title: "Competitors",
  description:
    "Find the competitors that truly overlap, read the pages earning their visibility, and turn them into ranked opportunities.",
};

export default function MarketingCompetitorsPage() {
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center">
          <h1 className="truncate text-sm font-medium text-foreground">
            Competitors
          </h1>
        </div>
      </PageHeader>
      <Suspense fallback={<LoadingSurface label="Loading competitors…" />}>
        <CompetitorAutopsyWorkspace />
      </Suspense>
    </>
  );
}
