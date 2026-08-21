import { Suspense } from "react";
import { fetchConversations } from "@/features/cx-dashboard/service";
import { filtersFromSearchParams } from "@/features/cx-dashboard/utils/filters";
import { CxErrorPanel } from "@/features/cx-dashboard/components/CxErrorPanel";
import { CxConversationsSkeleton } from "@/features/cx-dashboard/components/CxTabSkeletons";
import { ConversationsContent } from "./conversations-content";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// The page itself is sync — the await lives in the Suspense-wrapped child (plus
// loading.tsx for the route transition), so tab clicks paint instantly.
export default function ConversationsPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<CxConversationsSkeleton />}>
      <ConversationsData searchParams={searchParams} />
    </Suspense>
  );
}

async function ConversationsData({ searchParams }: Props) {
  const params = await searchParams;
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") urlParams.set(key, value);
  }
  const filters = filtersFromSearchParams(urlParams);
  const result = await fetchConversations(filters);

  if (!result.ok) {
    return <CxErrorPanel what="conversations" message={result.error} />;
  }

  return <ConversationsContent result={result.data} />;
}
