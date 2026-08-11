// app/(admin)/administration/agents/hindsight/page.tsx
//
// Hindsight — continuous review + Replay. The ONE home for this surface; the
// aidream dashboard's stopgap page was deleted when this landed.
//
// Super-admin gating is inherited from the (admin) route layout; every
// /hindsight endpoint is independently admin-gated server-side.

import { Suspense } from "react";

import { HindsightPage } from "@/features/administration/hindsight/components/HindsightPage";

export const metadata = {
  title: "Hindsight | Agents | Administration",
  description:
    "Continuous review — the platform reads its own transcripts and proposes fixes across four levers, with Replay evidence.",
};

export default function AdminHindsightPage() {
  // HindsightPage reads assist-chip deep links via useSearchParams.
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-md bg-muted/50" />}>
      <HindsightPage />
    </Suspense>
  );
}
