import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import CompetitorAutopsyWorkspace from "@/features/marketing/competitors/CompetitorAutopsyWorkspace";

export const metadata: Metadata = {
  title: "Competitors",
  description:
    "Find the competitors that truly overlap, read the pages earning their visibility, and turn them into ranked opportunities.",
};

export default function MarketingCompetitorsPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading competitors…" />}>
      <CompetitorAutopsyWorkspace />
    </Suspense>
  );
}
