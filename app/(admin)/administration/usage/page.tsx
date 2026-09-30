// app/(admin)/administration/usage/page.tsx — AI USAGE, ONE EXPLORER (lane DRILL-USAGE-PAGE).
//
// The first worked example of the semantic layer: every usage screen is one question of the
// declared definition `ai_usage`, asked through `platform.drill_ask` in the platform lane (the
// database refuses anyone but a platform admin inside the admin apps). Built beside the old pages
// (COPY mode): /administration/users/usage links here; nothing redirects.
// useSearchParams (the question lives in the address) needs a Suspense boundary.

import { Suspense } from "react";

import { UsageExplorer } from "@/features/admin/usage-drill/UsageExplorer";

export const metadata = {
  title: "AI usage | Administration",
  description: "Everyone's AI spend in one explorer: total at the top, drill into any person, organization, provider, model, feature or period, regroup, pivot, and keep a question as a Saved view.",
};

export default function AiUsagePage() {
  return (
    <Suspense
      fallback={
        <div className="p-4">
          <div className="h-96 animate-pulse rounded-md bg-muted/50" />
        </div>
      }
    >
      <UsageExplorer />
    </Suspense>
  );
}
