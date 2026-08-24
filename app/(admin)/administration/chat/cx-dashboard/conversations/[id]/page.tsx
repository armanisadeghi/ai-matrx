import { Suspense } from "react";
import { notFound } from "next/navigation";
import { fetchConversationDetail } from "@/features/cx-dashboard/service";
import { CxErrorPanel } from "@/features/cx-dashboard/components/CxErrorPanel";
import { CxDetailSkeleton } from "@/features/cx-dashboard/components/CxTabSkeletons";
import { ConversationDetailContent } from "./conversation-detail-content";

type Props = {
  params: Promise<{ id: string }>;
};

// The page itself is sync — the await lives in the Suspense-wrapped child (plus
// loading.tsx for the route transition), so navigation paints instantly.
export default function ConversationDetailPage({ params }: Props) {
  return (
    <Suspense fallback={<CxDetailSkeleton />}>
      <ConversationDetailData params={params} />
    </Suspense>
  );
}

async function ConversationDetailData({ params }: Props) {
  const { id } = await params;
  const result = await fetchConversationDetail(id);

  if (!result.ok) {
    return <CxErrorPanel what="conversation detail" message={result.error} />;
  }

  const { conversation, ...rest } = result.data;
  if (!conversation) {
    notFound();
  }

  return <ConversationDetailContent detail={{ conversation, ...rest }} />;
}
