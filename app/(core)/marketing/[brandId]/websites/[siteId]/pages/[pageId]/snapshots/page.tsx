import { Suspense } from "react";
import { SnapshotsTable } from "@/features/marketing/components/pages/SnapshotsTable";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default async function MarketingSnapshotsPage({
  params,
}: {
  params: Promise<{ pageId: string }>;
}) {
  const { pageId } = await params;
  return (
    <Suspense fallback={<LoadingSurface label="Loading snapshots…" />}>
      <SnapshotsTable pageId={pageId} />
    </Suspense>
  );
}
