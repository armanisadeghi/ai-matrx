"use client";

import { use, Suspense } from "react";
import { ContextItemDetail } from "@/features/agent-context/components/ContextItemDetail";
import { useContextScope } from "@/features/agent-context/hooks/useContextScope";
import { Skeleton } from "@/components/ui/skeleton";

export default function ItemDetailPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = use(params);

  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <ItemDetailContent itemId={itemId} />
    </Suspense>
  );
}

function ItemDetailContent({ itemId }: { itemId: string }) {
  const { scope } = useContextScope();
  return <ContextItemDetail itemId={itemId} scope={scope} />;
}
