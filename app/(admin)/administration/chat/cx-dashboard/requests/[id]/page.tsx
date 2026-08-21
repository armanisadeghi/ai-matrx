import { Suspense } from "react";
import { notFound } from "next/navigation";
import { fetchUserRequestDetail } from "@/features/cx-dashboard/service";
import { CxErrorPanel } from "@/features/cx-dashboard/components/CxErrorPanel";
import { CxDetailSkeleton } from "@/features/cx-dashboard/components/CxTabSkeletons";
import { RequestDetailContent } from "./request-detail-content";

type Props = {
  params: Promise<{ id: string }>;
};

// The page itself is sync — the await lives in the Suspense-wrapped child (plus
// loading.tsx for the route transition), so navigation paints instantly.
export default function RequestDetailPage({ params }: Props) {
  return (
    <Suspense fallback={<CxDetailSkeleton />}>
      <RequestDetailData params={params} />
    </Suspense>
  );
}

async function RequestDetailData({ params }: Props) {
  const { id } = await params;
  const result = await fetchUserRequestDetail(id);

  if (!result.ok) {
    return <CxErrorPanel what="request detail" message={result.error} />;
  }

  const { user_request, ...rest } = result.data;
  if (!user_request) {
    notFound();
  }

  return <RequestDetailContent detail={{ user_request, ...rest }} />;
}
