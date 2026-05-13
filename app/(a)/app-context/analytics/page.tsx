"use client";

import { Suspense } from "react";
import { ContextAnalytics } from "@/features/agent-context/components/ContextAnalytics";
import { useContextScope } from "@/features/agent-context/hooks/useContextScope";
import { Skeleton } from "@/components/ui/skeleton";

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <AnalyticsContent />
    </Suspense>
  );
}

function AnalyticsContent() {
  const { scope } = useContextScope();
  return (
    <div className="space-y-4">
      <h1 className="text-base font-bold">Context Analytics</h1>
      <ContextAnalytics scope={scope} />
    </div>
  );
}
