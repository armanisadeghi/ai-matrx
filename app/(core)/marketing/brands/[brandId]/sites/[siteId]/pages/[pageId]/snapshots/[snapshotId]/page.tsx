import { SnapshotDetail } from "@/features/marketing/components/pages/SnapshotDetail";

export default async function MarketingSnapshotDetailPage({
  params,
}: {
  params: Promise<{ pageId: string; snapshotId: string }>;
}) {
  const { pageId, snapshotId } = await params;
  return <SnapshotDetail pageId={pageId} snapshotId={snapshotId} />;
}
