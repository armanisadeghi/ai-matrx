"use client";

import { use, Suspense } from "react";
import { ContextVersionHistory } from "@/features/agent-context/components/ContextVersionHistory";
import { useContextScope } from "@/features/agent-context/hooks/useContextScope";
import { Skeleton } from "@/components/ui/skeleton";

export default function HistoryPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = use(params);

  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <HistoryContent itemId={itemId} />
    </Suspense>
  );
}

function HistoryContent({ itemId }: { itemId: string }) {
  const { scope } = useContextScope();
  return <ContextVersionHistory itemId={itemId} scope={scope} />;
}
