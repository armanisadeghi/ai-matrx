// app/(admin)/administration/knowledge/kg-cost/explore/page.tsx — KNOWLEDGE INGESTION'S UNIT ECONOMICS,
// ONE EXPLORER (lane DRILL-CONVERSIONS). The KG cost dashboard's per-run ledger as questions of the
// declared definition `kg_cost`, asked in the platform lane; the dashboard links here and keeps its own
// section beside it (COPY mode, nothing redirects).
// useSearchParams (the question lives in the address) needs a Suspense boundary.

import { Suspense } from "react";

import { KgCostExplorer } from "@/features/administration/kg-cost/components/KgCostExplorer";

export const metadata = {
  title: "Knowledge ingestion cost | Administration",
  description: "What reading notes, files, transcripts and pages into knowledge costs: by source kind, status, organization, person and period, with the runs behind every number.",
};

export default function KgCostExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="p-4">
          <div className="h-96 animate-pulse rounded-md bg-muted/50" />
        </div>
      }
    >
      <KgCostExplorer />
    </Suspense>
  );
}
