// The cross-client roll-up of one Search Console TOOL. Same workspace as the
// per-site route; the tool comes from this path, which the workspace reads
// itself (`searchConsoleToolTab`) — no prop its own URL writer would contradict.

import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { SearchConsoleGate } from "@/features/marketing/search-console/components/SearchConsoleGate";

export const metadata: Metadata = {
  title: "Search Console insights",
  description: "The algorithms that read your Search Console data for you.",
};

export default function ReportsSearchConsoleInsightsPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading insights…" />}>
      <SearchConsoleGate />
    </Suspense>
  );
}
