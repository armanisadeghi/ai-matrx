// app/(admin)/administration/reporting/producer-yield/page.tsx
//
// THE YIELD REGISTER — disease D13, "nobody measures value for spend"
// (common-docs/operations/agent-failure-diseases.md). Every autonomous spender
// and what its money actually bought.
//
// Super-admin gating is inherited from the (admin) route layout; the
// /admin/producer-yield endpoints are independently admin-gated server-side.

import { Suspense } from "react";

import { ProducerYieldConsole } from "@/features/admin/producer-yield/ProducerYieldConsole";

export const metadata = {
  title: "Yield register | Reporting | Administration",
  description:
    "What did the money buy? Accepted outcomes per produced outcome, and cost per accepted outcome, for every autonomous spender in the platform.",
};

export default function ProducerYieldPage() {
  // The console reads ?producer= deep links from the yield floor's assist chips.
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-md bg-muted/50" />}>
      <ProducerYieldConsole />
    </Suspense>
  );
}
